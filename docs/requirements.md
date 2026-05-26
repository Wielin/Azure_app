# Dokumentacja implementacji wymagan

## 1. Kontekst aplikacji
Aplikacja webowa typu "Exploit DB" do publikowania i przegladania wpisow o zagrozeniach.
Logowanie i dostep sa oparte o role, a dane przechowywane w SQLite.

## 2. Hasla i logowanie (jak to jest zrobione)
- Hasla sa hashowane funkcja `hashPassword()` z PBKDF2 (SHA-256, 120000 iteracji, losowa sol 16B, klucz 32B).
- Format przechowywania: `pbkdf2$iteracje$sol$hash`.
- Weryfikacja hasla: `verifyPassword()` ponownie wylicza hash i porownuje go `timingSafeEqual`.
- Podczas rejestracji `createUser()` zapisuje hash, a przy logowaniu `verifyPassword()` sprawdza dane.

Powiazane pliki:
- [src/lib/server/db.ts](src/lib/server/db.ts)
- [src/routes/register/+page.server.ts](src/routes/register/+page.server.ts)
- [src/routes/login/+page.server.ts](src/routes/login/+page.server.ts)

## 3. Role, sesje i dostep
- Sesja jest zapisywana w cookies jako token z tabeli Sessions.
- W [src/hooks.server.ts](src/hooks.server.ts) token jest mapowany na uzytkownika i role w `event.locals.user`.
- Role sa katalogiem w tabeli Roles, a przypisanie roli jest w Users.role_id.
- Panel /admin ogranicza operacje do roli Admin.
- Panel /contribute wymaga roli Contributor lub Admin.
- Gosc to brak sesji (brak tokenu); moze sie zalogowac i przegladac publiczne dane.

Powiazane pliki:
- [src/hooks.server.ts](src/hooks.server.ts)
- [src/routes/logout/+server.ts](src/routes/logout/+server.ts)
- [src/routes/guest/+server.ts](src/routes/guest/+server.ts)
- [src/routes/admin/+page.server.ts](src/routes/admin/+page.server.ts)
- [src/routes/contribute/+page.server.ts](src/routes/contribute/+page.server.ts)

## 4. Model danych (BD) i relacje
- Users i Roles: relacja 1-N, role jako katalog.
- Threads i Exploit_Meta: relacja 1-1 dla metadanych wpisu (uzasadnione jako osobna tabela).
- Tags jako katalog + Thread_Tags (N-N miedzy wpisami i tagami).
- Links (1-N do Threads).
- Likes (N-N miedzy Users i Threads).
- Sessions (1-N do Users).

Powiazane pliki:
- [src/lib/server/db.ts](src/lib/server/db.ts)

## 5. Wyszukiwanie, filtrowanie i paginacja
- Filtry i wyszukiwanie sa pobierane z URL (query, tagi, typ exploita, OS, protokol).
- Zapytanie buduje `searchThreadsPaged()` i stosuje `LIMIT/OFFSET` oraz opcjonalny `COUNT(*)`.
- Strona glowna wyswietla nawigacje paginacji oraz zakres wynikow.

Powiazane pliki:
- [src/routes/+page.server.ts](src/routes/+page.server.ts)
- [src/routes/+page.svelte](src/routes/+page.svelte)
- [src/lib/server/db.ts](src/lib/server/db.ts)

## 6. Walidacja formularzy
- Rejestracja: wymagane pola, haslo min. 6 znakow, potwierdzenie hasla, unikalnosc loginu i emaila.
- Dodawanie/edycja wpisu: wymagane tytul i tresc, CVSS w zakresie 0-10, URL tylko http/https,
  walidacja listy linkow i limit liczby linkow.

Powiazane pliki:
- [src/routes/register/+page.server.ts](src/routes/register/+page.server.ts)
- [src/routes/contribute/+page.server.ts](src/routes/contribute/+page.server.ts)

## 7. Ajax (live search)
- Endpoint JSON: /api/threads/search zwraca liste wpisow z limitem.
- Frontend uzywa fetch + debounce (250 ms) i wyswietla panel wynikow.

Powiazane pliki:
- [src/routes/api/threads/search/+server.ts](src/routes/api/threads/search/+server.ts)
- [src/routes/+page.svelte](src/routes/+page.svelte)

## 8. Podstrony funkcjonalne
- /: lista wpisow z filtrami i paginacja.
- /contribute: dodawanie i edycja wpisow (Contributor/Admin).
- /admin: nadawanie i odbieranie roli Contributor (Admin).

Powiazane pliki:
- [src/routes/+page.svelte](src/routes/+page.svelte)
- [src/routes/contribute/+page.svelte](src/routes/contribute/+page.svelte)
- [src/routes/admin/+page.svelte](src/routes/admin/+page.svelte)

## 9. Miejsca do rozbudowy (opcjonalnie)
- RODO: pola created_by i updated_by dla tabel z danymi osobowymi i logika ich wypelniania.
- Wielorole: tabela asocjacyjna User_Roles zamiast Users.role_id.
- Filtrowanie/paginacja listy uzytkownikow w panelu admina.
