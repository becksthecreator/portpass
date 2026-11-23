-- Bahamas Weddings By The Sea: the "How much does a ceremony cost?" answer
-- said "Ask for a personal quote" right under six priced packages. It now
-- points at those prices and says what can change the final quote. No
-- figures in the text, so it can't drift from the packages table.
update public.organization_faqs f
set answer = 'Each package above shows its price, from the ceremony alone to the full planned day. Antonio confirms your final quote after he reviews your plan, because the date, location, guest count and any extra services can change it.'
from public.organizations o
where f.organization_id = o.id
  and o.slug = 'bahamas-weddings'
  and f.question = 'How much does a ceremony cost?';
