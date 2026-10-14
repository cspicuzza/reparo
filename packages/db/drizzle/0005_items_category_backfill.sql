-- Custom migration (hand-written), OD-34. Runs before category_id becomes NOT NULL (0006):
-- any item created through the app between OD-33 and OD-34 has no category yet; file it under
-- Misc, the same rule 0004 used and the API now applies to new items.
UPDATE "items"
SET "category_id" = (SELECT "id" FROM "categories" WHERE "name" = 'Misc')
WHERE "category_id" IS NULL;
