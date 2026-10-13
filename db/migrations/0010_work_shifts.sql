alter table business_categories add column guidance text not null default '';

update business_categories set guidance = 'A retail firm earns a service fee when you or a hired worker completes a shift. The fee is the game rule service_shift_revenue, credited to the business balance. The worker''s posted wage is paid from that balance once per UTC day when the balance can cover it. The business keeps the rest. This category does not extract resources or run a factory recipe. Sell stock on the city market to turn goods into currency.'
where id = 'trade';

update business_categories set guidance = 'Manufacturing earns goods from recipes. A recipe spends stored inputs and an operating cost, waits out its duration, and stores the output in this city. A work shift collects a finished recipe. It does not create goods without those inputs. This category does not extract resources.'
where id = 'manufacturing';

update business_categories set guidance = 'A logistics firm earns a service fee when you or a hired worker completes a shift. The fee is the game rule service_shift_revenue, credited to the business balance. The worker''s posted wage is paid from that balance once per UTC day when the balance can cover it. Shipments move stock for a simulated great-circle cost. This category does not extract resources.'
where id = 'logistics';

update business_categories set guidance = 'Agriculture can mill flour when wheat is already in stock. Extraction of wheat or timber opens only after a positive sourced record exists for this country. Those figures are not loaded, so a site cannot be opened yet. A work shift runs one ready extraction site and stores the goods here. It does not invent a reserve.'
where id = 'agriculture';

update business_categories set guidance = 'Mining earns goods only by extraction. A site opens only when this country has a positive sourced reserve for that resource. Mineral figures are not loaded, so a site cannot be opened yet. A work shift runs one ready site and stores the goods here. The worker''s wage is paid from the business balance once per UTC day.'
where id = 'mining';

update business_categories set guidance = 'Energy can extract crude oil or natural gas when this country has a positive sourced proved reserve, and it can refine diesel when crude oil is in stock. A work shift runs one ready extraction site and stores the goods here. It does not change the reference reserve. The worker''s wage is paid from the business balance once per UTC day.'
where id = 'energy';

update business_categories set guidance = 'A construction firm earns a service fee when you or a hired worker completes a shift. The fee is the game rule service_shift_revenue, credited to the business balance. The worker''s posted wage is paid from that balance once per UTC day when the balance can cover it. This category does not extract resources or run a factory recipe.'
where id = 'construction';

update business_categories set guidance = 'A finance firm does not extract resources or manufacture goods. A work shift credits the game rule service_shift_revenue to the business balance. You see that fee as inflow and as a ledger row named service fee. The hired worker is paid their posted wage from the business once per UTC day when the balance can cover it. The business keeps the rest. You can work a shift yourself, and a hired player works one from the Jobs page.'
where id = 'finance';

update business_categories set guidance = 'A hospitality firm earns a service fee when you or a hired worker completes a shift. The fee is the game rule service_shift_revenue, credited to the business balance. The worker''s posted wage is paid from that balance once per UTC day when the balance can cover it. This category does not extract resources or run a factory recipe.'
where id = 'hospitality';

insert into game_rules (key, amount) values
  ('service_shift_revenue', 20),
  ('work_shift_cooldown_seconds', 60)
on conflict (key) do nothing;

create table work_shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  employment_id uuid references employments (id) on delete set null,
  kind text not null check (kind in ('service', 'extraction', 'production')),
  gross integer not null check (gross >= 0),
  wage_paid integer not null default 0 check (wage_paid >= 0),
  detail text not null,
  created_at timestamptz not null default now()
);

create index work_shifts_business_idx on work_shifts (business_id, created_at desc);
create index work_shifts_character_idx on work_shifts (character_id, created_at desc);
