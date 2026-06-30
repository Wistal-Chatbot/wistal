import "server-only";

/**
 * Static description of the 9 read-only ERP tables in `public`, injected into the
 * system prompt so the model can write text-to-SQL without a metadata round-trip
 * (architecture: "full schema in the prompt" for MVP). Sources: the canonical
 * `references/database-schema.md` and `docs/Neon_struktura_bazy (1).pdf`.
 *
 * TODO: in the future this could be generated from Neon instead of hand-kept —
 * introspect `information_schema` for columns/types and pull Polish business
 * descriptions + synonyms from `chatbot.schema_objects`.
 */
export const ERP_SCHEMA_DESCRIPTION = `# Schemat bazy ERP (schemat \`public\`, tylko do odczytu)

Klucze złączeń to kody biznesowe, nigdy wewnętrzne ID. Wszystkie kwoty są NUMERIC.

## kontrahenci  (klienci i dostawcy)
- kod TEXT (PK), nazwa TEXT, nip TEXT, kod_pocztowy TEXT, miasto TEXT, telefon TEXT, email TEXT, uwagi TEXT
- Synonimy: klient, kontrahent, dostawca, firma.

## towary  (produkty / asortyment)
- kod TEXT (PK), nazwa TEXT, ilosc_dostepna NUMERIC, ilosc NUMERIC, rezerwacje NUMERIC,
  zamowienia NUMERIC, cena NUMERIC, wartosc NUMERIC, wartosc_zakupu NUMERIC, jm TEXT, jmp TEXT
- Synonimy: towar, produkt, asortyment, materiał, stan magazynowy (= ilosc_dostepna).

## faktury_sprzedazy  (faktury sprzedaży, FA)
- numer_dokumentu TEXT (PK), status TEXT, data_wystawienia DATE, kontrahent_kod TEXT,
  kontrahent_nazwa TEXT, nip TEXT, netto NUMERIC, brutto NUMERIC, status_ksef TEXT
- Złączenie: kontrahent_kod -> kontrahenci.kod
- Synonimy: faktura, FA, sprzedaż.

## faktury_sprzedazy_pozycje  (pozycje faktur sprzedaży)
- numer_faktury TEXT, lp INTEGER, towar_kod TEXT (PK: numer_faktury+lp+towar_kod),
  nazwa TEXT, ilosc NUMERIC, rabat NUMERIC, cena NUMERIC, wartosc NUMERIC, marza NUMERIC
- Złączenia: numer_faktury -> faktury_sprzedazy.numer_dokumentu; towar_kod -> towary.kod

## faktury_zakupu  (faktury zakupu, FZ)
- numer_dokumentu TEXT (PK), dokument_zrodlowy TEXT, status TEXT, data_wplywu DATE,
  data_zakupu DATE, kontrahent_kod TEXT, kontrahent_nazwa TEXT, nip TEXT, miasto TEXT,
  netto NUMERIC, brutto NUMERIC
- Złączenie: kontrahent_kod -> kontrahenci.kod
- Synonimy: faktura zakupu, FZ, zakup.

## faktury_zakupu_pozycje  (pozycje faktur zakupu)
- numer_faktury TEXT, lp INTEGER, towar_kod TEXT (PK: numer_faktury+lp+towar_kod),
  nazwa TEXT, ilosc NUMERIC, jm TEXT, cena NUMERIC, wartosc NUMERIC
- Złączenia: numer_faktury -> faktury_zakupu.numer_dokumentu; towar_kod -> towary.kod

## zamowienia_dostawcy  (zamówienia do dostawców, ZD)
- numer_dokumentu TEXT (PK), status TEXT, termin_dostawy DATE, kontrahent_kod TEXT,
  kontrahent_nazwa TEXT, nip TEXT, miasto TEXT, nadawca TEXT, kod_nadawcy TEXT,
  netto NUMERIC, brutto NUMERIC
- Złączenia: kontrahent_kod, kod_nadawcy -> kontrahenci.kod
- Synonimy: zamówienie, ZD, zamówienie do dostawcy.

## zamowienia_dostawcy_pozycje  (pozycje zamówień do dostawców)
- numer_zamowienia TEXT, lp INTEGER, towar_kod TEXT (PK: numer_zamowienia+lp+towar_kod),
  nazwa TEXT, ilosc NUMERIC, jm TEXT, cena NUMERIC, wartosc NUMERIC
- Złączenia: numer_zamowienia -> zamowienia_dostawcy.numer_dokumentu; towar_kod -> towary.kod

## dokumenty_powiazane  (powiązania między dokumentami, poziom nagłówków)
- numer_zrodlowy TEXT, typ_zrodlowy TEXT, numer_docelowy TEXT, typ_docelowy TEXT, data DATE
  (PK: numer_zrodlowy+numer_docelowy)
- Łączy dokumenty na poziomie nagłówków (np. WZ -> FA). Jeden dokument docelowy może mieć
  wiele źródłowych (np. 3 WZ skladają się na 1 FA = trzy wiersze z tym samym numer_docelowy).
  Brak powiązań na poziomie pojedynczych pozycji.`;
