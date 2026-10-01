-- SCiPNET — department filing permissions.
-- member_post = 1: any cleared personnel may file documents.
-- member_post = 0: Site Command (admins) only.

ALTER TABLE categories ADD COLUMN member_post INTEGER NOT NULL DEFAULT 0;
UPDATE categories SET member_post = 1 WHERE slug = 'general';
