-- Eksi verirken not zorunlu değil; listede olmayan durumlar için akademik ve davranışta "Diğer" (artı ve eksi, not zorunlu)
UPDATE "conduct_criteria" SET "note_required" = false WHERE "points" < 0 AND "label" <> 'Diğer';--> statement-breakpoint
INSERT INTO "conduct_criteria" ("school_id", "level", "group", "label", "points", "note_required", "sort_order")
SELECT l."school_id", l."level", o."group", 'Diğer', o."points", true, l."max_order" + o."n"
FROM (SELECT "school_id", "level", max("sort_order") AS "max_order" FROM "conduct_criteria" GROUP BY "school_id", "level") l
CROSS JOIN (VALUES ('academic', 1, 1), ('academic', -1, 2), ('behavior', 1, 3), ('behavior', -1, 4)) AS o("group", "points", "n")
WHERE NOT EXISTS (
	SELECT 1 FROM "conduct_criteria" c
	WHERE c."school_id" = l."school_id" AND c."level" = l."level" AND c."group" = o."group" AND c."label" = 'Diğer' AND sign(c."points") = sign(o."points")
);
