-- Parent profile photo (Firebase Storage object key under profiles/<userId>/) and plan feature bullets shown to parents.
ALTER TABLE users ADD COLUMN photo_key varchar(300);

ALTER TABLE plans ADD COLUMN features text[] NOT NULL DEFAULT '{}';
ALTER TABLE plans ADD CONSTRAINT ck_plans_features_count CHECK (cardinality(features) <= 8);
