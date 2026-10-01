-- SCiPNET — baseline departments (required for posting; idempotent).
-- Display names/descriptions for these slugs are localized client-side
-- (see src/i18n) — the values stored here are the English source.

INSERT OR IGNORE INTO categories (id, slug, name, description, sort_order, created_at) VALUES
  ('cat-announcements', 'announcements', 'Site Directives',           'Orders and notices issued by Site Command.',            0, 1788000000000),
  ('cat-general',       'general',       'Personnel Commons',         'Open discussion for cleared staff.',                    1, 1788000000000),
  ('cat-design',        'design',        'Records & Format',          'Document craft — formatting, typography, presentation.', 2, 1788000000000),
  ('cat-engineering',   'engineering',   'Engineering & Containment', 'Systems, infrastructure, containment mechanics.',       3, 1788000000000),
  ('cat-meta',          'meta',          'SCiPNET Meta',              'About this terminal itself.',                           4, 1788000000000);
