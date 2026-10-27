-- The built-in Walk-in customer (SRS §4, D-009). The integration setup re-seeds it after truncating.
INSERT INTO "customers" ("proprietor_name", "is_system")
VALUES ('Walk-in', true)
ON CONFLICT ("proprietor_name", "shop_name") DO NOTHING;
