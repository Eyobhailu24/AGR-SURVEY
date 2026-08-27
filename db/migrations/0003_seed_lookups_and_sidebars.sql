-- Starter lookup values and the 3 sidebars that replace today's hardcoded
-- greenhouse/nitrate/potassium tabs. All of this stays fully editable
-- afterwards (Editor/Super_Admin) via the sample-type/measurement-type
-- lists and the "Add sidebar" flow — these are just sensible defaults so
-- the app isn't empty on first load.

insert into sample_types (key, label, sort_order, created_by) values
  ('soil', 'Soil', 1, 'system:migration'),
  ('leaf', 'Leaf', 2, 'system:migration'),
  ('other', 'Other', 3, 'system:migration');

insert into measurement_types (key, label, unit, sort_order, created_by) values
  ('height', 'Plant height', 'cm', 1, 'system:migration'),
  ('no3', 'Nitrate (NO3)', null, 2, 'system:migration'),
  ('k', 'Potassium (K)', null, 3, 'system:migration'),
  ('other', 'Other', null, 4, 'system:migration');

insert into sidebars (name, slug, description, includes_text_record, column_schema, sort_order, created_by) values
  (
    'Greenhouse analysis',
    'greenhouse',
    'Plant height and soil observations',
    true,
    '[
      {"key": "B", "label": "B", "type": "number", "required": false},
      {"key": "Y", "label": "Y", "type": "number", "required": false},
      {"key": "G", "label": "G", "type": "number", "required": false}
    ]'::jsonb,
    1,
    'system:migration'
  ),
  (
    'Nitrate lab test',
    'nitrate',
    'Horiba readings from top and bottom samples',
    true,
    '[
      {"key": "NO3", "label": "NO3 readings", "type": "text", "required": false}
    ]'::jsonb,
    2,
    'system:migration'
  ),
  (
    'Potassium lab test',
    'potassium',
    'Potassium readings from each pot',
    true,
    '[
      {"key": "K", "label": "K readings", "type": "text", "required": false}
    ]'::jsonb,
    3,
    'system:migration'
  );
