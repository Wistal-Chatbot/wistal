**Dokumentacja API BizRaport**

Kompleksowy przewodnik po API do danych o polskich firmach

# **1\. Dane firmy (/api/dane)**

## **Przegląd**

API dostarcza kompleksowopiych danych o polskich firmach, obejmujących informacje rejestrowe, dane finansowe, opisy działalności, powiązania korporacyjne oraz strukturę udziałowców.

## **Endpoint**

https://api.bizraport.pl/api/dane?email=abc@xyz.pl\&password=qwe\&krs=123

https://api.bizraport.pl/api/dane?email=abc@xyz.pl\&password=qwe\&nip=123456

## **Uwierzytelnienie**

Wymagane podanie danych uwierzytelniających poprzez:

* Parametry URL: email i password  
* HTTP Basic Auth

## **Parametry żądania**

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| krs | String | Numer KRS firmy (wymagany jeśli brak nip) |
| nip | String | Numer NIP firmy (wymagany jeśli brak krs) |

## **Format danych**

Wszystkie dane są zwracane w formacie JSON. Pola zawierające struktury zagnieżdżone są serializowane jako ciągi znaków JSON.

## 

## **Rozszerzenie danych powiązań**

Aby otrzymać poszerzone powiązania (dodatkowo powiązania osób i podmiotów powiązanych z odpytywanym podmiotem, czyli jeden poziom głębiej), dodaj do zapytania parametr:

rozszerz\_polaczenia=tak

Każdy element listy powiazania zostanie wtedy uzupełniony o pole powiazania\_rozszerzone \- listę osób i podmiotów, z którymi dana osoba lub podmiot jest powiązany.

## 

## 

## **Struktura główna**

### **Pola główne**

| Pole | Typ | Opis |
| ----- | ----- | ----- |
| krs | String | Numer KRS firmy (klucz główny) |
| nip | String | Numer identyfikacji podatkowej (NIP) |
| kod\_pkd | String | Kod PKD działalności gospodarczej (podklasa) |
| opis\_pkd | String | Słowny opis działalności według PKD |
| informacje\_o\_firmie | JSON String | Podstawowe informacje rejestrowe o firmie |
| dane\_finansowe | JSON String | Dane finansowe i wskaźniki ekonomiczne |
| opisy\_firmy | JSON String | Opisy działalności i punkty kluczowe |
| powiazania | JSON String | Powiązania korporacyjne i osobowe |
| udzialy | JSON String | Struktura właścicielska i udziałowcy |
| monitor\_sadowy | JSON String | Informacje z Monitora Sądowego |
| krz | JSON String | Informacje z KRZ |

## **Szczegółowy opis pól**

### **1\. informacje\_o\_firmie**

Zawiera tablicę obiektów z podstawowymi informacjami o firmie.

Struktura:

\[

{

 "nazwa\_pola": "string", 

 "wartosc": "string"

 }

\]

Dostępne pola (nazwa\_pola):

* cel\_dzialalnosci \- Cel działalności spółki  
* data\_wpisu\_do\_rejestru \- Data wpisu do rejestru KRS  
* data\_wykreslenia\_z\_krs \- Data wykreślenia z rejestru (jeśli dotyczy)  
* kod\_pocztowy \- Kod pocztowy siedziby  
* miejscowosc \- Miejscowość siedziby  
* organ\_rejestrowy \- Organ rejestrowy prowadzący KRS  
* regon \- Numer REGON  
* ulica \- Ulica siedziby  
* adres\_strony\_internetowej \- Adres strony WWW firmy  
* email \- Adres email kontaktowy  
* kapital\_zakladowy \- Wartość i waluta kapitału zakładowego  
* wojewodztwo \- Województwo  
* forma\_prawna \- Forma prawna podmiotu  
* nip \- Numer NIP  
* nazwa \- Pełna nazwa firmy

### 

### **2\. dane\_finansowe**

Zawiera tablicę danych finansowych dla różnych okresów sprawozdawczych.

Struktura:

\[

{ 

 "okres\_sprawozdawczy": "string",

 "kwota": number,

 "nazwa\_wskaznika": "string",

 "rok": number 

}

\]

Dostępne wskaźniki (nazwa\_wskaznika):

**Aktywa i Kapitał:**

* aktywa\_trwale \- Aktywa trwałe  
* aktywa\_obrotowe \- Aktywa obrotowe  
* suma\_bilansowa \- Suma bilansowa  
* kapital\_wlasny \- Kapitał własny  
* zobowiazania\_i\_rezerwy \- Zobowiązania i rezerwy na zobowiązania

**Wielkość firmy:**

* przychody \- Przychody całkowite  
* przychody\_operacyjne \- Przychody operacyjne  
* przychody\_ze\_sprzedazy \- Przychody ze sprzedaży  
* Zatrudnienie / zatrudnienie\_estymowane \- Zatrudnienie

**Koszty:**

* koszty\_operacyjne \- Koszty operacyjne  
* koszty\_sprzedanych\_produktow \- Koszty sprzedanych produktów  
* podatek\_dochodowy \- Podatek dochodowy  
* amortyzacja \- Amortyzacja

**Zyski i Straty:**

* zysk\_brutto\_ze\_sprzedazy \- Zysk (strata) brutto ze sprzedaży  
* zysk\_ze\_sprzedazy \- Zysk (strata) ze sprzedaży  
* zysk\_operacyjny \- Zysk (strata) z działalności operacyjnej  
* zysk\_brutto \- Zysk brutto  
* zysk\_netto \- Zysk netto

**Wskaźniki rentowności:**

* ebit \- EBIT (zysk przed odsetkami i podatkami)  
* ebitda \- EBITDA (zysk przed odsetkami, podatkami, deprecjacją i amortyzacją)  
* marza\_operacyjna \- Marża operacyjna  
* marza\_netto \- Marża netto  
* roe \- ROE (zwrot z kapitału własnego)  
* roa \- ROA (zwrot z aktywów)

**Modele ryzyka:**

* ryzyko\_upadlosci \- Prawdopodobieństwo upadłości (0-1)  
* ryzyko\_zamkniecia \- Prawdopodobieństwo zamknięcia działalności (0-1)

### 

### **3\. opisy\_firmy**

Zawiera opisy tekstowe działalności firmy oraz punkty kluczowe.

Struktura:

\[

{

 "opis": "string",

 "punkt\_kluczowy\_1": "string",

 "punkt\_kluczowy\_2": "string",

 "punkt\_kluczowy\_3": "string",

 "punkt\_kluczowy\_4": "string",

 "punkt\_kluczowy\_5": "string" 

}

\]

### **4\. powiazania**

Zawiera informacje o powiązaniach korporacyjnych i osobowych firmy.

Typy powiązań:

* reprezentacja \- Osoba/podmiot reprezentujący spółkę  
* wspólnik \- Wspólnik spółki  
* organ nadzoru \- Członek organu nadzoru  
* prokurent \- Prokurent

### **5\. udzialy**

Zawiera informacje o strukturze właścicielskiej firmy.

Uwaga: Dane są sortowane malejąco według procentu udziałów.

Struktura:

\[

{

 "typ\_podmiotu": "string",

 "nazwa": "string",

 "procent\_udzialow": "string",

 "id\_podmiotu": "string"

}

\]

### 

### 

### 

### 

### 

### **6\. monitor\_sadowy**

Ogłoszenia z Monitora Sądowego i Gospodarczego (MSiG) powiązane z KRS: wpisy do KRS, upadłości, restrukturyzacje, likwidacje, ogłoszenia wymagane przez KSH/KPC/prawo upadłościowe.

Struktura:

\[

  {

    "numer\_ogloszenia": "string",

    "sygnatura\_sprawy": "string",

    "tresc\_naglowka": "string",

    "nr\_monitora": "string (numer/rok)",

    "rozdzial": "string | null",

    "tresc\_ogloszenia": "string",

    "data\_publikacji": "string (YYYY-MM-DD)",

    "nazwa\_podmiotu": "string",

    "poziom\_istotnosci": "string ('UWAGA' | 'Rzuć okiem' | 'Zmiana formalna')"

  }

\]

### **7\. krz**

Zawiera informacje z Krajowego Rejestru Zadłużonych (obwieszczenia o postępowaniach upadłościowych, restrukturyzacyjnych, zakazach prowadzenia działalności itp.).

Struktura:

\[

  {

    "data\_krz": "string (YYYY-MM-DD)",

    "grupa\_kategorii\_tytul": "string",

    "kategoria\_tytul": "string",

    "numer\_obwieszczenia": "string",

    "tytul\_obwieszczenia": "string",

    "sygnatura\_akt": "string",

    "sad": "string",

    "wydzial\_sadu": "string",

    "dluznik\_typ": "string ('podmiot' | 'osoba\_fizyczna')",

    "tresc": "string",

    "id\_osoby": "string | null",

    "przypisanie\_do\_krs": "string ('podmiot' | 'osoba\_fizyczna')"

  }

\]

## 

## 

## 

## **Wartości NULL**

Pola mogą przyjmować wartość null w następujących przypadkach:

* Brak danych dla danej firmy  
* Dane niedostępne w źródle  
* Nieaplikowalne dla danego typu firmy

Pola z zagnieżdżonymi strukturami JSON zwracają null zamiast pustego ciągu, jeśli brak danych.

## **Uwagi techniczne**

1\. Parsowanie JSON: Pola informacje\_o\_firmie, dane\_finansowe, opisy\_firmy, powiazania i udzialy są zwracane jako ciągi znaków JSON i wymagają parsowania po stronie klienta.

2\. Encoding: Wszystkie dane są zwracane w kodowaniu UTF-8.

3\. Typy danych:

* Wartości numeryczne w dane\_finansowe.kwota są typu float  
* Wartości procentowe są zapisane jako liczby dziesiętne (np. 0.15 \= 15%)  
* Daty są w formacie DD-MM-YYYY lub DD.MM.YYYY

4\. Sortowanie:

* dane\_finansowe: sortowane malejąco według sortowanie\_float i nazwa\_wskaznika  
* powiazania: sortowane według typ\_powiazania i nazwa  
* udzialy: sortowane malejąco według procent\_udzialow

5\. Okresy sprawozdawcze: Mogą mieć różną długość w zależności od roku obrotowego firmy.

# 

# **2\. Katalog firm (/api/katalog)**

## **Przegląd**

API umożliwia filtrowanie i wyszukiwanie firm według różnych kryteriów finansowych, lokalizacyjnych i klasyfikacyjnych. Zwraca listę numerów KRS firm spełniających zadane kryteria. Może służyć jako narzędzie do wyszukiwania leadów B2B.

## **Endpoint**

https://api.bizraport.pl/api/katalog?email=abc@xyz.pl\&password=qwe\&przychody\_od=10000000\&przychody\_do=11000000

## **Uwierzytelnienie**

Wymagane podanie danych uwierzytelniających poprzez:

* Parametry URL: email i password  
* HTTP Basic Auth

## **Odpowiedź**

### **Struktura JSON**

{

"data": \[{ "krs": "0000123456\_" }, ...\],

"count": 12345,

"fetchedCount": 1000

}

| Pole | Typ | Opis |
| ----- | ----- | ----- |
| data | Array | Lista obiektów z numerami KRS |
| data\[\].krs | String | Numer KRS (10 cyfr \+ "\_") |
| count | Number | Całkowita liczba wyników spełniających kryteria |
| fetchedCount | Number | Liczba zwróconych rekordów (max 1 000 000\) |

## 

## 

## 

## 

## 

## **Parametry filtrowania**

### **Filtry finansowe (zakresy)**

Wszystkie filtry finansowe przyjmują wartości liczbowe. Użyj sufiksu \_od dla minimum i \_do dla maksimum.

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| przychody\_od / przychody\_do | Number | Przychody całkowite |
| zysk\_netto\_od / zysk\_netto\_do | Number | Zysk netto |
| zobowiazania\_i\_rezerwy\_na\_zobowiazania\_od / \_do | Number | Zobowiązania i rezerwy |
| przychody\_operacyjne\_od / przychody\_operacyjne\_do | Number | Przychody operacyjne |
| aktywa\_obrotowe\_od / aktywa\_obrotowe\_do | Number | Aktywa obrotowe |
| kapital\_wlasny\_od / kapital\_wlasny\_do | Number | Kapitał własny |
| suma\_bilansowa\_od / suma\_bilansowa\_do | Number | Suma bilansowa |
| kapital\_zakladowy\_liczbowo\_od / \_do | Number | Kapitał zakładowy |
| podatek\_dochodowy\_od / podatek\_dochodowy\_do | Number | Podatek dochodowy |
| zysk\_z\_dzialalnosci\_operacyjnej\_od / \_do | Number | Zysk z działalności operacyjnej |
| aktywa\_trwale\_od / aktywa\_trwale\_do | Number | Aktywa trwałe |
| koszty\_operacyjne\_od / koszty\_operacyjne\_do | Number | Koszty operacyjne |
| estymowana\_wartosc\_firmy\_od / \_do | Number | Estymowana wartość firmy |
| wynagrodzenia\_od / wynagrodzenia\_do | Number | Wynagrodzenia |
| amortyzacja\_od / amortyzacja\_do | Number | Amortyzacja |
| ebit\_od / ebit\_do | Number | EBIT |
| ebitda\_od / ebitda\_do | Number | EBITDA |
| zatrudnienie\_od / zatrudnienie\_do | Number | Zatrudnienie |

### 

### **Filtry czasowe**

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| ostatni\_rok\_sprawozdania\_od / \_do | Number | Rok ostatniego sprawozdania (np. 2023\) |
| rok\_wpisu\_do\_rejestru\_od / \_do | Number | Rok wpisu do rejestru |
| rok\_rozpoczecia\_dzialalnosci\_od / \_do | Number | Rok rozpoczęcia działalności |

### 

### 

### **Filtry procentowe**

**WAŻNE:** Wszystkie wskaźniki procentowe (ROA, ROE, marże, CAGR, wskaźnik zadłużenia) podawane są jako liczby całkowite reprezentujące procenty. Na przykład: roa\_od=15 oznacza ROA ≥ 15%, a nie 0.15.

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| roa\_od / roa\_do | Number | ROA \- zwrot z aktywów (%) |
| roe\_od / roe\_do | Number | ROE \- zwrot z kapitału własnego (%) |
| marza\_netto\_od / marza\_netto\_do | Number | Marża netto (%) |
| marza\_operacyjna\_od / marza\_operacyjna\_do | Number | Marża operacyjna (%) |
| wskaznik\_zadluzenia\_od / \_do | Number | Wskaźnik zadłużenia (%) |
| srednioroczny\_wzrost\_przychodow\_3\_lata\_od / \_do | Number | CAGR przychodów (3 lata) (%) |

### **Filtry klasyfikacji PKD**

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| pkd\_sekcja | String | Sekcja PKD (np. C, G, J) \- wielkie litery |
| pkd\_dzial | String | Dział PKD (np. 62, 47\) |
| pkd\_podklasa | String | Podklasa PKD (np. 62.01.Z) \- wielkie litery |

### **Filtry lokalizacyjne siedziby / tekstowe**

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| wojewodztwo | String | Województwo (wielkie litery, bez myślinków, np. MAZOWIECKIE, WARMINSKOMAZURSKIE) |
| miasto | String | Miejscowość (wyszukiwanie częściowe) |
| adres | String | Ulica (wyszukiwanie częściowe) |
| gmina | String | Gmina (wyszukiwanie częściowe) |
| powiat | String | Powiat (wyszukiwanie częściowe) |
| kod\_pocztowy\_poczatek | String | Początek kodu pocztowego (np. 00\) |
| kod\_pocztowy\_koncowka | String | Końcówka kodu pocztowego (np. 001\) |
| opis | String | Wyszukiwanie firm bazują na ich opisie, np. opis=erp |

### 

### 

### **Filtry boolowskie**

Akceptowane wartości: "tak"

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| czy\_ma\_jednostke\_terenowa | Boolean | Czy firma ma jednostkę terenową |
| czy\_ma\_jednostke\_terenowa\_poza\_polska | Boolean | Czy firma ma jednostkę poza Polską |
| czy\_status\_opp | Boolean | Czy firma ma status OPP |
| czy\_wiekszosciowy\_udzialowiec | Boolean | Czy firma ma większościowego udziałowca |
| nie\_wykreslona | Boolean | Tylko firmy aktywne (niewykreślone z KRS) |

### **Filtr ilości wierszy**

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| limit | Number | Ogranicza ilość zwróconych wierszy (pozwala lepiej kontrolować koszty) |

## **Przykłady użycia**

Firmy z przychodami powyżej 10 mln zł:

https://api.bizraport.pl/api/katalog?email=abc@xyz.pl\&password=qwe\&przychody\_od=10000000

Firmy IT w województwie mazowieckim:

https://api.bizraport.pl/api/katalog?email=abc@xyz.pl\&password=qwe\&pkd\_sekcja=J\&wojewodztwo=MAZOWIECKIE

Aktywne firmy z ROE powyżej 15%:

https://api.bizraport.pl/api/katalog?email=abc@xyz.pl\&password=qwe\&roe\_od=15\&nie\_wykreslona=tak

# 

# **3\. Wyszukiwanie firm (/api/szukaj)**

## **Przegląd**

API umożliwia wyszukiwanie firm po nazwie.

## **Endpoint**

https://api.bizraport.pl/api/szukaj?email=abc@xyz.pl\&password=qwe\&q=abc

## **Uwierzytelnienie**

Wymagane podanie danych uwierzytelniających poprzez:

* Parametry URL: email i password  
* HTTP Basic Auth

## **Parametry żądania**

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| q | String | Fraza wyszukiwania (nazwa firmy, NIP, KRS, REGON) |
| limit | Number | Ogranicza ilość zwróconych wierszy (pozwala lepiej kontrolować koszty) |

## **Odpowiedź**

### **Struktura JSON**

{

"data": \[{ "krs": "0000123456\_" }, ...\],

"dane\_uciete": false

}

| Pole | Typ | Opis |
| ----- | ----- | ----- |
| data | Array | Lista obiektów z numerami KRS |
| dane\_uciete | Boolean | true jeśli wynik ograniczony (parametr limit lub \>100 tys.) |

# **4\. Zużycie danych (/api/zuzycie)**

## **Przegląd**

API umożliwia sprawdzenie ilości zwróconych danych i kosztów.

## **Endpoint**

https://api.bizraport.pl/api/zuzycie?email=abc@xyz.pl\&password=qwe

## **Uwierzytelnienie**

Wymagane podanie danych uwierzytelniających poprzez:

* Parametry URL: email i password  
* HTTP Basic Auth

## **Parametry żądania**

Parametry są opcjonalne. Gdy pominięte, system zwróci dane o zużyciu za bieżący miesiąc.

| Parametr | Typ | Opis |
| ----- | ----- | ----- |
| month | Number | Miesiąc za który sprawdzane zużycie |
| year | Number | Rok za który sprawdzane zużycie |

## **Odpowiedź**

### **Struktura JSON**

{

"miesiac": "2026-02",

"zuzycie": {

   "/dane": 150,

   "/katalog": 3200,

   "/szukaj": 480

   },

"koszt\_netto\_pln": 87.10

}

| Pole | Typ | Opis |
| ----- | ----- | ----- |
| miesiac | String | Miesiąc (YYYY-MM) |
| zuzycie\[“\<path\>”\] | Integer | Ilość zwróconych wierszy per endpoint API |
| koszt\_netto\_pln | Number | Łączny koszt netto w PLN |

# **5\. Wsparcie**

W przypadku pytań lub problemów technicznych prosimy o kontakt z zespołem wsparcia.

**Kontakt:** kontakt@bizraport.pl