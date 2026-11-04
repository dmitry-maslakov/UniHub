-- media types as ingest writes them now: the essence, or none if it isn't
-- one (as node's MIMEType reads it: http whitespace trimmed, parameters
-- dropped, token characters on both sides of one slash, lower case). Rows
-- from before then read like new ones, and nothing needs to fix them up
UPDATE "File" AS f
SET mime = p.mime
FROM (
  SELECT id,
    CASE
      WHEN essence ~ '^[-!#$%&''*+.^_`|~0-9A-Za-z]+/[-!#$%&''*+.^_`|~0-9A-Za-z]+$'
      THEN lower(essence)
    END AS mime
  FROM (
    SELECT id, btrim(split_part(mime, ';', 1), E' \t\n\r') AS essence
    FROM "File"
    WHERE mime IS NOT NULL
  ) AS e
) AS p
WHERE f.id = p.id AND f.mime IS DISTINCT FROM p.mime;
