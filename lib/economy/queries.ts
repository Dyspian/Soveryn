import type { Sql } from "@/lib/db";
import { productionOperatingCost, SERVICE_SHIFT_SKILL } from "@/lib/economy/service";
import { nodeBonus } from "@/lib/progression/service";

export type BusinessSummary = {
  id: string;
  name: string;
  description: string;
  category: string;
  categoryName: string;
  balance: number;
  city: string;
  country: string;
  iso2: string;
  placeId: string;
  countryId: string;
  status: string;
};

export async function listMyBusinesses(sql: Sql, userId: string): Promise<BusinessSummary[]> {
  const rows = await sql.query<BusinessSummary & { balance: number | string }>(
    `select b.id, b.name, b.description, b.category, c.name as "categoryName", b.balance,
            p.name as city, co.name as country, co.iso2, b.place_id as "placeId", b.country_id as "countryId", b.status
     from businesses b
     join characters ch on ch.id = b.owner_character_id
     join business_categories c on c.id = b.category
     join places p on p.id = b.place_id
     join countries co on co.id = b.country_id
     where ch.user_id = $1
     order by b.created_at desc`,
    [userId],
  );
  return rows.map((row) => ({ ...row, balance: Number(row.balance) }));
}

export async function loadBusiness(sql: Sql, userId: string, businessId: string) {
  const rows = await sql.query<{
    id: string;
    name: string;
    description: string;
    category: string;
    balance: number | string;
    city: string;
    country: string;
    placeId: string;
    countryId: string;
    countryIso2: string;
    owner: boolean;
    currency: number | string;
    guidance: string;
    shiftCooling: boolean;
  }>(
    `select b.id, b.name, b.description, b.category, b.balance, p.name as city, co.name as country,
            b.place_id as "placeId", b.country_id as "countryId", co.iso2 as "countryIso2",
            ch.user_id = $2 as owner,
            (select currency from characters where user_id = $2) as currency,
            cat.guidance,
            exists (
              select 1 from work_shifts w
              join characters worker on worker.id = w.character_id
              where worker.user_id = $2
                and w.created_at > now() - ((select greatest(60, least(86400, amount)) from game_rules where key = 'work_shift_cooldown_seconds') * interval '1 second')
            ) as "shiftCooling"
     from businesses b
     join characters ch on ch.id = b.owner_character_id
     join business_categories cat on cat.id = b.category
     join places p on p.id = b.place_id
     join countries co on co.id = b.country_id
     where b.id = $1 and b.status = 'active' and (
       ch.user_id = $2 or exists (
         select 1 from employments e
         join characters worker on worker.id = e.character_id
         where e.business_id = b.id and e.status = 'active' and worker.user_id = $2
       )
     )`,
    [businessId, userId],
  );
  const business = rows[0];
  if (!business) return null;
  const [stock, jobs, sites, ledger, employees, shipments, recipes, shifts] = await Promise.all([
    sql.query<{ productId: string; name: string; quantity: number; unit: string }>(
      `select s.product_id as "productId", pr.name, s.quantity, pr.unit
       from stock_holdings s join products pr on pr.id = s.product_id
       where s.holder_kind = 'business' and s.holder_id = $1 and s.place_id = $2`,
      [business.id, business.placeId],
    ),
    sql.query<{ id: string; name: string; status: string; ready: boolean }>(
      `select j.id, r.name, j.status, j.completes_at <= now() as ready
       from production_jobs j join recipes r on r.id = j.recipe_id
       where j.business_id = $1 and j.status = 'running'
       order by j.completes_at`,
      [business.id],
    ),
    sql.query<{ id: string; resourceId: string; resource: string; remaining: number; status: string; cooling: boolean }>(
      `select s.id, s.resource_type_id as "resourceId", t.name as resource, s.simulated_remaining as remaining, s.status,
              coalesce(s.next_available_at > now(), false) as cooling
       from extraction_sites s join resource_types t on t.id = s.resource_type_id
       where s.business_id = $1`,
      [business.id],
    ),
    sql.query<{ reason: string; amount: number | string; direction: string; created_at: string }>(
      `select reason, amount,
              case when to_kind = 'business' and to_id = $1 then 'in' else 'out' end as direction,
              created_at::text as created_at
       from ledger_entries
       where (from_kind = 'business' and from_id = $1) or (to_kind = 'business' and to_id = $1)
       order by created_at desc
       limit 12`,
      [business.id],
    ),
    sql.query<{ id: string; username: string; wage: number }>(
      `select e.id, c.username, e.wage
       from employments e join characters c on c.id = e.character_id
       where e.business_id = $1 and e.status = 'active'`,
      [business.id],
    ),
    sql.query<{ id: string; status: string; product: string; quantity: number; destination: string; ready: boolean }>(
      `select s.id, s.status, pr.name as product, s.quantity, p.name as destination, s.arrives_at <= now() as ready
       from shipments s
       join products pr on pr.id = s.product_id
       join places p on p.id = s.destination_place_id
       where s.holder_kind = 'business' and s.holder_id = $1
       order by s.created_at desc
       limit 8`,
      [business.id],
    ),
    sql.query<{
      id: string;
      name: string;
      description: string;
      operatingCost: number;
      durationSeconds: number;
      outputName: string;
      outputQuantity: number;
      inputs: string;
    }>(
      `select r.id, r.name, r.description, r.operating_cost as "operatingCost", r.duration_seconds as "durationSeconds",
              outp.name as "outputName", r.output_quantity as "outputQuantity",
              coalesce(string_agg(pr.name || ' × ' || i.quantity::text, ', ' order by pr.name), '') as inputs
       from recipes r
       join products outp on outp.id = r.output_product_id
       left join recipe_inputs i on i.recipe_id = r.id
       left join products pr on pr.id = i.product_id
       where position($1 in r.allowed_categories) > 0
       group by r.id, outp.name
       order by r.name`,
      [business.category],
    ),
    sql.query<{ id: string; username: string; kind: string; gross: number; wagePaid: number; detail: string; createdAt: string }>(
      `select w.id, c.username, w.kind, w.gross, w.wage_paid as "wagePaid", w.detail, w.created_at as "createdAt"
       from work_shifts w
       join characters c on c.id = w.character_id
       where w.business_id = $1
       order by w.created_at desc
       limit 8`,
      [business.id],
    ),
  ]);
  const production = await sql.query<{ level: number }>(
    `select cs.level
     from character_skills cs
     join characters c on c.id = cs.character_id
     where c.user_id = $1 and cs.skill_id = 'production'`,
    [userId],
  );
  const reduction = await sql.query<{ amount: number | string }>(
    "select amount from game_rules where key = 'production_cost_reduction_per_level'",
  );
  const perLevel = reduction[0] ? Number(reduction[0].amount) : null;
  const productionLevel = Number(production[0]?.level ?? 0);
  const character = await sql.query<{ id: string }>("select id from characters where user_id = $1", [userId]);
  const focusReduction = character[0]
    ? await nodeBonus(sql, character[0].id, "production_cost_flat", { kind: "general" })
    : 0;
  const inputRows = await sql.query<{ recipeId: string; productId: string; name: string; quantity: number }>(
    `select i.recipe_id as "recipeId", i.product_id as "productId", pr.name, i.quantity
     from recipe_inputs i
     join recipes r on r.id = i.recipe_id
     join products pr on pr.id = i.product_id
     where position($1 in r.allowed_categories) > 0`,
    [business.category],
  );
  const held = new Map(stock.map((row) => [row.productId, Number(row.quantity)]));
  const revenue = ledger.filter((row) => row.direction === "in").reduce((sum, row) => sum + Number(row.amount), 0);
  const expenses = ledger.filter((row) => row.direction === "out").reduce((sum, row) => sum + Number(row.amount), 0);
  return {
    ...business,
    owner: Boolean(business.owner),
    balance: Number(business.balance),
    currency: Number(business.currency),
    stock,
    jobs,
    sites,
    ledger: ledger.map((row) => ({ ...row, amount: Number(row.amount) })),
    employees,
    shipments,
    recipes: recipes.map((recipe) => ({
      ...recipe,
      operatingCost: Number(recipe.operatingCost),
      durationSeconds: Number(recipe.durationSeconds),
      outputQuantity: Number(recipe.outputQuantity),
      chargedCost: productionOperatingCost(Number(recipe.operatingCost), productionLevel, perLevel, focusReduction),
      inputLines: inputRows
        .filter((row) => row.recipeId === recipe.id)
        .map((row) => ({
          productId: row.productId,
          name: row.name,
          quantity: Number(row.quantity),
          held: held.get(row.productId) ?? 0,
        })),
    })),
    shiftSkill: SERVICE_SHIFT_SKILL[business.category] ?? null,
    shifts,
    revenue,
    expenses,
  };
}

export async function listCategories(sql: Sql) {
  return sql.query<{ id: string; name: string; startupCost: number; guidance: string }>(
    `select id, name, startup_cost as "startupCost", guidance from business_categories order by name`,
  );
}

export async function listProducts(sql: Sql) {
  return sql.query<{ id: string; name: string; unit: string; category: string }>(
    "select id, name, unit, category from products order by name",
  );
}

export async function marketListings(sql: Sql, placeId: string) {
  return sql.query<{ id: string; productId: string; product: string; category: string; quantity: number; unitPrice: number; seller: string }>(
    `select l.id, l.product_id as "productId", pr.name as product, pr.category, l.quantity, l.unit_price as "unitPrice",
            case when l.seller_kind = 'business' then b.name else c.username end as seller
     from market_listings l
     join products pr on pr.id = l.product_id
     left join businesses b on l.seller_kind = 'business' and b.id = l.seller_id
     left join characters c on l.seller_kind = 'character' and c.id = l.seller_id
     where l.place_id = $1 and l.status = 'open'
     order by l.created_at desc`,
    [placeId],
  );
}

export async function cityTradeFacts(sql: Sql, placeId: string) {
  const [sales, supply] = await Promise.all([
    sql.query<{ productId: string; name: string; unitPrice: number; soldAt: string }>(
      `select distinct on (l.product_id) l.product_id as "productId", pr.name, l.unit_price as "unitPrice", l.sold_at as "soldAt"
       from market_listings l
       join products pr on pr.id = l.product_id
       where l.place_id = $1 and l.status = 'sold' and l.sold_at is not null
       order by l.product_id, l.sold_at desc`,
      [placeId],
    ),
    sql.query<{ productId: string; name: string; quantity: number }>(
      `select l.product_id as "productId", pr.name, coalesce(sum(l.quantity), 0)::int as quantity
       from market_listings l
       join products pr on pr.id = l.product_id
       where l.place_id = $1 and l.status = 'open'
       group by l.product_id, pr.name
       order by pr.name`,
      [placeId],
    ),
  ]);
  return {
    sales: sales.map((row) => ({ ...row, unitPrice: Number(row.unitPrice) })),
    supply: supply.map((row) => ({ ...row, quantity: Number(row.quantity) })),
  };
}

export async function viewerMarket(sql: Sql, userId: string, placeId: string) {
  const character = await sql.query<{ id: string }>("select id from characters where user_id = $1", [userId]);
  const characterId = character[0]?.id;
  if (!characterId) return { stock: [], listings: [] };
  const [stock, listings] = await Promise.all([
    sql.query<{ productId: string; name: string; quantity: number }>(
      `select s.product_id as "productId", pr.name, s.quantity
       from stock_holdings s
       join products pr on pr.id = s.product_id
       where s.holder_kind = 'character' and s.holder_id = $1 and s.place_id = $2 and s.quantity > 0
       order by pr.name`,
      [characterId, placeId],
    ),
    sql.query<{ id: string; productId: string; product: string; quantity: number; unitPrice: number; seller: string }>(
      `select l.id, l.product_id as "productId", pr.name as product, l.quantity, l.unit_price as "unitPrice",
              case when l.seller_kind = 'business' then b.name else 'You' end as seller
       from market_listings l
       join products pr on pr.id = l.product_id
       left join businesses b on l.seller_kind = 'business' and b.id = l.seller_id
       where l.place_id = $2 and l.status = 'open'
         and (
           (l.seller_kind = 'character' and l.seller_id = $1)
           or (l.seller_kind = 'business' and b.owner_character_id = $1)
         )
       order by l.created_at desc`,
      [characterId, placeId],
    ),
  ]);
  return {
    stock: stock.map((row) => ({ ...row, quantity: Number(row.quantity) })),
    listings: listings.map((row) => ({ ...row, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice) })),
  };
}

export async function openJobs(sql: Sql) {
  return sql.query<{ id: string; title: string; wage: number; business: string; category: string; city: string; skill: string | null; minLevel: number }>(
    `select p.id, p.title, p.wage, b.name as business, b.category, pl.name as city, s.name as skill, p.min_skill_level as "minLevel"
     from job_postings p
     join businesses b on b.id = p.business_id
     join places pl on pl.id = b.place_id
     left join skill_definitions s on s.id = p.skill_id
     where p.status = 'open'
     order by p.created_at desc
     limit 50`,
  );
}

export async function myEmployment(sql: Sql, userId: string) {
  return sql.query<{ businessId: string; business: string; category: string; guidance: string; wage: number; status: string; cooling: boolean }>(
    `select b.id as "businessId", b.name as business, b.category, cat.guidance, e.wage, e.status,
            exists (
              select 1 from work_shifts w
              where w.character_id = c.id
                and w.created_at > now() - ((select greatest(60, least(86400, amount)) from game_rules where key = 'work_shift_cooldown_seconds') * interval '1 second')
            ) as cooling
     from employments e
     join characters c on c.id = e.character_id
     join businesses b on b.id = e.business_id
     join business_categories cat on cat.id = b.category
     where c.user_id = $1
     order by e.hired_at desc
     limit 10`,
    [userId],
  );
}

export async function pendingApplications(sql: Sql, userId: string) {
  return sql.query<{ id: string; username: string; title: string; businessId: string }>(
    `select a.id, c.username, p.title, p.business_id as "businessId"
     from job_applications a
     join job_postings p on p.id = a.posting_id
     join businesses b on b.id = p.business_id
     join characters owner on owner.id = b.owner_character_id
     join characters c on c.id = a.character_id
     where a.status = 'pending' and owner.user_id = $1`,
    [userId],
  );
}

export async function resourceOverview(sql: Sql, iso2?: string, resourceType?: string) {
  const rows = await sql.query<{
    iso2: string;
    country: string;
    resourceType: string;
    resourceName: string;
    metric: string;
    amount: string | null;
    quality: string;
    unit: string;
    period: string;
    source: string;
    license: string;
    notes: string;
    level: string;
  }>(
    `select c.iso2, c.name as country, r.resource_type_id as "resourceType", t.name as "resourceName",
            r.metric, r.amount::text as amount, r.amount_quality as quality, r.unit,
            r.period_label as period, s.name as source, s.license, r.notes, r.geographic_level as level
     from resource_records r
     join countries c on c.id = r.country_id
     join resource_types t on t.id = r.resource_type_id
     join data_sources s on s.id = r.source_id
     where ($1::text is null or c.iso2 = $1)
       and ($2::text is null or r.resource_type_id = $2)
     order by c.name, t.name, r.metric`,
    [iso2 ?? null, resourceType ?? null],
  );
  return rows;
}

export async function listResourceTypes(sql: Sql) {
  return sql.query<{ id: string; name: string }>("select id, name from resource_types order by name");
}

export async function characterAccounts(sql: Sql, userId: string) {
  const totals = await sql.query<{ income: number | string; spending: number | string }>(
    `select
       coalesce(sum(e.amount) filter (where e.to_kind = 'character' and e.to_id = c.id), 0) as income,
       coalesce(sum(e.amount) filter (where e.from_kind = 'character' and e.from_id = c.id), 0) as spending
     from characters c
     left join ledger_entries e on (e.to_kind = 'character' and e.to_id = c.id) or (e.from_kind = 'character' and e.from_id = c.id)
     where c.user_id = $1
     group by c.id`,
    [userId],
  );
  const entries = await sql.query<{ reason: string; amount: number | string; direction: string; createdAt: string }>(
    `select e.reason, e.amount,
            case when e.to_kind = 'character' and e.to_id = c.id then 'in' else 'out' end as direction,
            e.created_at::text as "createdAt"
     from ledger_entries e
     join characters c on c.user_id = $1
     where (e.to_kind = 'character' and e.to_id = c.id) or (e.from_kind = 'character' and e.from_id = c.id)
     order by e.created_at desc
     limit 16`,
    [userId],
  );
  return {
    income: Number(totals[0]?.income ?? 0),
    spending: Number(totals[0]?.spending ?? 0),
    entries: entries.map((entry) => ({ ...entry, amount: Number(entry.amount) })),
  };
}
