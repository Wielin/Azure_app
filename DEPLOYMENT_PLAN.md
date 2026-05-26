# Plan wdrożenia aplikacji na Azure

## Kontekst

Aplikacja: **Exploit DB** — SvelteKit SSR + SQLite (node:sqlite, Node 22+)  
Cel: wdrożenie na Azure spełniające wymagania projektowe

### Wymagania do spełnienia

| Wymaganie | Rozwiązanie |
|-----------|-------------|
| Aplikacja CRUD + CI/CD | GitHub Actions → Azure VM |
| HTTPS + hash haseł | Nginx + Let's Encrypt / PBKDF2 (już w kodzie) |
| VM z Terraform/Ansible | Azure VM + **Ansible** |
| Mikrousługi — 2 kontenery | Docker Compose: `nginx` + `app` |

### Architektura końcowa

```
GitHub push (branch: main)
        │
        ▼
GitHub Actions (CI/CD pipeline)
        │  1. build image
        │  2. push → ghcr.io (GitHub Container Registry, bezpłatny)
        │  3. SSH → VM → docker compose pull && up
        ▼
Azure VM Standard_B1s (~€8/mies., Ubuntu 22.04)
  skonfigurowana przez Ansible
        │
        ├── [Kontener 1] nginx  ← port 443 HTTPS ← Internet
        │       │  reverse proxy
        │       └──────────────────────────┐
        │                                  ▼
        └── [Kontener 2] sveltekit-app    port 3000 (wewnętrzny)
                │
                └── volume: /app/data/app.db  (SQLite)
```

---

## Kolejność etapów (TL;DR)

```
1. [DONE] Zmiana adaptera SvelteKit
2. GitHub — repo + push kodu
3. GitHub Actions — CI/CD (build + push obrazów)
4. Homelab — test Docker Compose (zamiast WSL)
5. Azure — ręczne stworzenie VM przez portal/az CLI
6. Ansible — playbook konfiguruje VM (Docker + deploy)
7. HTTPS — Let's Encrypt na VM
8. Weryfikacja end-to-end
```

---

## Etap 0 — Zmiana adaptera SvelteKit (DONE)

Zmiany już wprowadzone:
- `svelte.config.js`: `adapter-auto` → `adapter-node`
- `package.json`: `@sveltejs/adapter-node` zamiast `adapter-auto`
- `npm install` wykonany
- `Dockerfile` stworzony

`adapter-node` generuje `node build` — jedyna opcja działająca w Dockerze.

---

## Etap 1 — GitHub

**Cel: repozytorium jako źródło prawdy — kod + CI/CD w jednym miejscu.**

### 1.1 Stworzenie repo na GitHub

1. `github.com` → New repository
2. Nazwa: np. `exploit-db`
3. Private (bezpieczniej dla projektu z credentialami w secrets)

### 1.2 Push kodu

```bash
cd /mnt/d/Studia\ R2S4/Chmury/aplikacja_projektowa

git init
git add .
git commit -m "feat: initial app with Docker setup"
git branch -M main
git remote add origin https://github.com/TWOJ_USER/exploit-db.git
git push -u origin main
```

> **Sprawdź `.gitignore`** — nie może trafić do repo:
> - `/data/*.db` (SQLite) — już jest w .gitignore ✅
> - `*.pem`, klucze SSH — dodaj jeśli będziesz generować lokalnie
> - `.env*` — już jest ✅

---

## Etap 2 — CI/CD (GitHub Actions)

**Cel: każdy push na `main` automatycznie buduje i wypycha obrazy Docker na GHCR.**  
Deploy na VM skonfigurujemy w Etapie 6 (po założeniu VM).

### 2.1 Struktura pliku

Stwórz `.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

env:
  IMAGE_APP: ghcr.io/${{ github.repository }}/app
  IMAGE_NGINX: ghcr.io/${{ github.repository }}/nginx

jobs:
  build:
    name: Build & Push images
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build & push app image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ env.IMAGE_APP }}:latest
            ${{ env.IMAGE_APP }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build & push nginx image
        uses: docker/build-push-action@v5
        with:
          context: ./nginx
          push: true
          tags: |
            ${{ env.IMAGE_NGINX }}:latest
            ${{ env.IMAGE_NGINX }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    name: Deploy to VM
    needs: build
    runs-on: ubuntu-latest

    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VM_HOST }}
          username: ${{ secrets.VM_USER }}
          key: ${{ secrets.VM_SSH_KEY }}
          script: |
            echo "${{ secrets.GHCR_TOKEN }}" | docker login ghcr.io \
              -u "${{ secrets.GHCR_USERNAME }}" --password-stdin
            cd /opt/exploitdb
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

### 2.2 GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Wartość | Jak uzyskać |
|--------|---------|-------------|
| `VM_HOST` | FQDN lub IP VM | po stworzeniu VM w Etapie 5 |
| `VM_USER` | `azureuser` | przy tworzeniu VM |
| `VM_SSH_KEY` | zawartość klucza prywatnego | `cat ~/.ssh/exploitdb_vm` |
| `GHCR_USERNAME` | login GitHub | profil github.com |
| `GHCR_TOKEN` | Personal Access Token z `write:packages` | GitHub → Settings → Developer settings → PAT |

> `VM_HOST`, `VM_USER`, `VM_SSH_KEY` uzupełnisz po Etapie 5.  
> `GHCR_USERNAME` i `GHCR_TOKEN` możesz dodać od razu.

### 2.3 Test pipeline (build only)

```bash
git add .github/
git commit -m "ci: add GitHub Actions pipeline"
git push origin main
```

Idź na `github.com/TWOJ_USER/exploit-db/actions` — job `build` powinien przejść.  
Job `deploy` będzie fail (brak VM_HOST) — to normalne na tym etapie.

---

## Etap 3 — Pliki Docker + test na homelabie

**Cel: weryfikacja że aplikacja działa w kontenerach PRZED wgraniem na Azure.**

### 3.1 Plik `nginx/nginx.conf` (wersja dev — HTTP)

```nginx
upstream app {
    server app:3000;
}

server {
    listen 80;
    server_name _;

    location / {
        proxy_pass         http://app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

### 3.2 Plik `nginx/Dockerfile`

```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
```

### 3.3 Plik `docker-compose.yml` (wersja dev)

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    volumes:
      - app_data:/app/data
    environment:
      NODE_ENV: production
    networks:
      - internal
    expose:
      - "3000"

  nginx:
    build: ./nginx
    restart: unless-stopped
    ports:
      - "8080:80"
    depends_on:
      - app
    networks:
      - internal

networks:
  internal:
    driver: bridge

volumes:
  app_data:
```

> Port 8080 w wersji dev. Na Azure będzie 80/443.

### 3.4 Test na homelabie

Wgraj kod na homelab (git pull lub rsync), następnie:

```bash
docker compose up --build
```

Otwórz `http://IP_HOMELABA:8080` — sprawdź:
- [ ] Strona główna ładuje się
- [ ] Rejestracja działa
- [ ] Logowanie działa
- [ ] Dodanie/edycja/usunięcie wpisu działa (CRUD)
- [ ] Panel admina działa

```bash
docker compose down
```

### 3.5 Konfiguracja nginx dla Azure (HTTPS)

Na Azure nginx będzie potrzebował HTTPS. Możesz mieć dwa pliki i podmienić przy deployu,  
albo użyć jednego z env variable. Najprostsze podejście — osobny plik `nginx/nginx.prod.conf`:

```nginx
upstream app {
    server app:3000;
}

server {
    listen 80;
    server_name _;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate     /etc/letsencrypt/live/TWOJA_DOMENA/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/TWOJA_DOMENA/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_session_cache   shared:SSL:10m;

    location / {
        proxy_pass         http://app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto https;
    }
}
```

> `TWOJA_DOMENA` = np. `exploitdb-jan.westeurope.cloudapp.azure.com`  
> Podmienisz przed deployem na Azure lub zautomatyzujesz przez Ansible template.

---

## Etap 4 — Azure VM (ręczne stworzenie)

**Cel: mieć VM gotową do konfiguracji przez Ansible.**

### 4.1 Instalacja az CLI (lokalnie)

```bash
curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
az login
```

### 4.2 Klucz SSH

```bash
ssh-keygen -t ed25519 -C "exploitdb-vm" -f ~/.ssh/exploitdb_vm
# ~/.ssh/exploitdb_vm     ← klucz prywatny (NIGDY do repo!)
# ~/.ssh/exploitdb_vm.pub ← klucz publiczny
```

### 4.3 Stworzenie VM przez az CLI

```bash
# Resource group
az group create \
  --name rg-exploitdb \
  --location westeurope

# VM — Standard_B1s, Ubuntu 22.04, klucz SSH
az vm create \
  --resource-group rg-exploitdb \
  --name vm-exploitdb \
  --image Ubuntu2204 \
  --size Standard_B1s \
  --admin-username azureuser \
  --ssh-key-values ~/.ssh/exploitdb_vm.pub \
  --public-ip-sku Standard \
  --public-ip-address-dns-name exploitdb-jan

# Otwórz porty
az vm open-port \
  --resource-group rg-exploitdb \
  --name vm-exploitdb \
  --port 22,80,443 \
  --priority 100

# Sprawdź FQDN
az network public-ip show \
  --resource-group rg-exploitdb \
  --name vm-exploitdbPublicIP \
  --query dnsSettings.fqdn \
  --output tsv
# → exploitdb-jan.westeurope.cloudapp.azure.com
```

### 4.4 Test połączenia SSH

```bash
ssh -i ~/.ssh/exploitdb_vm azureuser@exploitdb-jan.westeurope.cloudapp.azure.com
exit
```

---

## Etap 5 — Ansible (konfiguracja VM)

**Cel: Ansible instaluje Docker, konfiguruje nginx, uruchamia kontenery.**

### 5.1 Instalacja Ansible (lokalnie)

```bash
pip install ansible
# lub
sudo apt install ansible

# Kolekcja Azure (opcjonalnie — tylko jeśli chcesz zarządzać VM przez Ansible)
ansible-galaxy collection install azure.azcollection
```

### 5.2 Struktura plików Ansible

```
ansible/
├── inventory.yml
├── playbook.yml
└── templates/
    ├── docker-compose.yml.j2
    └── nginx.conf.j2
```

### 5.3 `ansible/inventory.yml`

```yaml
all:
  hosts:
    exploitdb:
      ansible_host: exploitdb-jan.westeurope.cloudapp.azure.com
      ansible_user: azureuser
      ansible_ssh_private_key_file: ~/.ssh/exploitdb_vm
      ansible_python_interpreter: /usr/bin/python3
```

### 5.4 `ansible/templates/docker-compose.yml.j2`

```yaml
services:
  app:
    image: ghcr.io/{{ ghcr_username }}/exploit-db/app:latest
    restart: unless-stopped
    volumes:
      - ./data:/app/data
    environment:
      NODE_ENV: production
    networks:
      - internal
    expose:
      - "3000"

  nginx:
    image: ghcr.io/{{ ghcr_username }}/exploit-db/nginx:latest
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - certbot_webroot:/var/www/certbot
    depends_on:
      - app
    networks:
      - internal

networks:
  internal:
    driver: bridge

volumes:
  certbot_webroot:
```

### 5.5 `ansible/playbook.yml`

```yaml
---
- name: Configure ExploitDB VM
  hosts: exploitdb
  become: true
  vars:
    ghcr_username: "TWOJ_GITHUB_USER"
    ghcr_token: "{{ lookup('env', 'GHCR_TOKEN') }}"
    app_domain: "exploitdb-jan.westeurope.cloudapp.azure.com"
    app_dir: /opt/exploitdb

  tasks:
    - name: Update apt cache
      apt:
        update_cache: true
        cache_valid_time: 3600

    - name: Install required packages
      apt:
        name:
          - ca-certificates
          - curl
          - gnupg
          - lsb-release
          - certbot
        state: present

    - name: Add Docker GPG key
      apt_key:
        url: https://download.docker.com/linux/ubuntu/gpg
        state: present

    - name: Add Docker repository
      apt_repository:
        repo: "deb [arch=amd64] https://download.docker.com/linux/ubuntu {{ ansible_distribution_release }} stable"
        state: present

    - name: Install Docker
      apt:
        name:
          - docker-ce
          - docker-ce-cli
          - containerd.io
          - docker-compose-plugin
        state: present
        update_cache: true

    - name: Start and enable Docker
      service:
        name: docker
        state: started
        enabled: true

    - name: Add azureuser to docker group
      user:
        name: azureuser
        groups: docker
        append: true

    - name: Create app directories
      file:
        path: "{{ item }}"
        state: directory
        owner: azureuser
        group: azureuser
        mode: "0755"
      loop:
        - "{{ app_dir }}"
        - "{{ app_dir }}/data"

    - name: Copy docker-compose.yml
      template:
        src: templates/docker-compose.yml.j2
        dest: "{{ app_dir }}/docker-compose.yml"
        owner: azureuser
        group: azureuser
        mode: "0644"

    - name: Login to GHCR
      community.docker.docker_login:
        registry: ghcr.io
        username: "{{ ghcr_username }}"
        password: "{{ ghcr_token }}"
      become_user: azureuser

    - name: Pull and start containers (HTTP first — przed certyfikatem)
      community.docker.docker_compose_v2:
        project_src: "{{ app_dir }}"
        state: present
        pull: always
      become_user: azureuser

    - name: Obtain Let's Encrypt certificate
      command: >
        certbot certonly --standalone
        -d {{ app_domain }}
        --email admin@example.com
        --agree-tos --non-interactive
        --pre-hook "docker compose -f {{ app_dir }}/docker-compose.yml stop nginx"
        --post-hook "docker compose -f {{ app_dir }}/docker-compose.yml start nginx"
      args:
        creates: /etc/letsencrypt/live/{{ app_domain }}/fullchain.pem

    - name: Restart nginx (z certyfikatem)
      community.docker.docker_compose_v2:
        project_src: "{{ app_dir }}"
        services:
          - nginx
        state: restarted
      become_user: azureuser

    - name: Setup certbot auto-renewal cron
      cron:
        name: certbot renew
        minute: "0"
        hour: "3"
        job: >
          certbot renew --quiet
          --pre-hook "docker compose -f {{ app_dir }}/docker-compose.yml stop nginx"
          --post-hook "docker compose -f {{ app_dir }}/docker-compose.yml start nginx"
```

### 5.6 Uruchomienie playbooka

```bash
cd ansible/

# Podaj GHCR_TOKEN jako zmienną środowiskową (nie hardcode w pliku!)
export GHCR_TOKEN="ghp_TWOJ_TOKEN"

# Dry run — podgląd bez zmian
ansible-playbook -i inventory.yml playbook.yml --check

# Właściwy deploy
ansible-playbook -i inventory.yml playbook.yml
```

---

## Etap 6 — HTTPS (weryfikacja)

Po uruchomieniu playbooka certbot powinien już mieć certyfikat.  
Sprawdź:

```bash
# Na VM przez SSH
ls /etc/letsencrypt/live/exploitdb-jan.westeurope.cloudapp.azure.com/
# powinno być: fullchain.pem, privkey.pem

# Test HTTPS
curl -I https://exploitdb-jan.westeurope.cloudapp.azure.com
# HTTP/2 200
```

W przeglądarce: `https://exploitdb-jan.westeurope.cloudapp.azure.com` → zielona kłódka.

---

## Etap 7 — Podpięcie CI/CD do VM

Uzupełnij GitHub Secrets (Settings → Secrets → Actions):

| Secret | Wartość |
|--------|---------|
| `VM_HOST` | `exploitdb-jan.westeurope.cloudapp.azure.com` |
| `VM_USER` | `azureuser` |
| `VM_SSH_KEY` | `cat ~/.ssh/exploitdb_vm` (cała zawartość) |

Następnie zrób push żeby przetestować pełny pipeline:

```bash
git add .
git commit -m "ci: complete pipeline with VM secrets"
git push origin main
```

`github.com/TWOJ_USER/exploit-db/actions` → oba joby (`build` i `deploy`) powinny być zielone.

---

## Etap 8 — Weryfikacja końcowa

```
[ ] https://exploitdb-jan.westeurope.cloudapp.azure.com — zielona kłódka
[ ] Rejestracja nowego użytkownika
[ ] Logowanie
[ ] Dodanie wpisu (Create)
[ ] Edycja wpisu (Update)
[ ] Usunięcie wpisu (Delete)
[ ] Wyszukiwanie i filtry
[ ] Panel admina — zmiana roli
[ ] Push na GitHub → Actions zielone → zmiana widoczna na Azure
[ ] ansible-playbook --check przechodzi bez błędów
```

---

## Kosztorys

| Zasób | SKU | Koszt/mies. |
|-------|-----|-------------|
| Virtual Machine | Standard_B1s (1 vCPU, 1 GB) | ~€7.28 |
| OS Disk | Standard HDD 30 GB | ~€1.20 |
| Public IP | Standard Static | €0 (przy VM) |
| Sieć egress | ~1 GB/mies. | ~€0.08 |
| GHCR | do 500 MB free | €0 |
| Let's Encrypt | | €0 |
| **Razem** | | **~€8.50/mies.** |

Przy budżecie 85€ → **~10 miesięcy** działania.

```bash
# Wyłącz VM po prezentacji (zatrzymuje naliczanie za compute, dysk nadal liczy)
az vm deallocate --resource-group rg-exploitdb --name vm-exploitdb

# Całkowite usunięcie (koniec projektu)
az group delete --name rg-exploitdb --yes --no-wait
```
