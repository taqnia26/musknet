# ZATCA Phase-1 QR implementation summary

The npm ecosystem was evaluated before implementing the TLV encoder. `zatca-qr`
was unavailable from the project registry. The available `zatca` package
(1.0.2, last published in 2023) combines XML, certificate/API submission, and
QR behavior intended for later integration phases; it is not a narrowly scoped,
auditable Phase-1 encoder and would materially enlarge the trusted surface.

The project therefore uses a small centralized encoder that implements ZATCA's
five mandatory Phase-1 fields in order (seller name, VAT registration number,
ISO-8601 timestamp, VAT-inclusive total, VAT total). Length octets are computed
from UTF-8 bytes, and the resulting TLV bytes are Base64-encoded and stored with
the immutable invoice snapshot. Fields longer than one-octet TLV permits are
rejected. QR PNG rendering uses the established `qrcode` npm package rather
than handwritten QR generation. Both registered seller fields are environment-backed:
`VAT_SELLER_LEGAL_NAME` supplies the legal seller name and
`VAT_REGISTRATION_NUMBER` supplies the 15-digit VAT registration number.

Invoice numbers are allocated with `pg_advisory_xact_lock` plus `MAX + 1` in
the same database transaction as invoice creation and the payment transition.
There is no PostgreSQL sequence for the business invoice number. Failed
transactions consume no business number; an order row lock and unique nullable
order foreign key provide idempotent exactly-once issuance under concurrency.
Both manual administration updates and the internal trusted storefront-payment
completion boundary call this same transition. The public storefront API cannot
self-assert payment success; a future payment-provider adapter must verify its
provider response before passing the trusted completion signal.

Automated tests verify field order, UTF-8 Arabic byte lengths, Base64 round trips,
amount formatting, timestamps, rollback behavior, and concurrency. These are
implementation-level vectors, not an official ZATCA certification suite. A manual
compliance review with the merchant's registered seller details and a ZATCA-approved
scanner is still required before production use.