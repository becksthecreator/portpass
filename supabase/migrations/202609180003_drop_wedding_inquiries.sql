-- Superseded by wedding_leads (see 202609170002_wedding_leads.sql and the
-- migration of its rows in 202609180002). The planner and quick-enquiry
-- form both write to wedding_leads now; nothing reads wedding_inquiries.
drop table public.wedding_inquiries;
