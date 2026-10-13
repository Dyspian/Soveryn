update business_categories set guidance = 'Agriculture can mill flour when wheat is already in stock. A work shift runs one ready extraction site and stores the goods here. A site opens only when this country has a positive proved-reserve row. An imported production statistic is reference data, not a stockpile, and it does not open a site.'
where id = 'agriculture';

update business_categories set guidance = 'Mining earns goods only by extraction. A site opens only when this country has a positive proved-reserve row for that resource. Imported mine-production statistics are reference data and do not open a site or create a stockpile. A work shift runs one ready site and stores the goods here. The worker''s wage is paid from the business balance once per UTC day.'
where id = 'mining';
