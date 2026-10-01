# Closing a PortPass account

The Privacy Policy says: "Email us and we will close your PortPass account
within 40 days. That removes your sign-in and your profile." There is no
button for this yet. Until there is, a founder does it by hand in the
Supabase dashboard. Write down the date the request arrived; the 40 days
run from then.

## Before you start

1. Confirm the request came from the account's own email address. If it
   came from somewhere else, reply to the account's address and ask.
2. Check whether the person is the **only owner** of a business
   (Admin -> People shows their memberships). If they are, agree with them
   who takes over, or whether the listing comes down, before closing the
   account. Closing it first leaves the listing with no owner.

## Close the account

In the Supabase dashboard: Authentication -> Users -> find the email ->
Delete user.

What that does on its own:

- The sign-in and the profile are removed, and the person is signed out
  everywhere.
- Their team memberships end.
- Log entries they made stay, with the person removed from them.
- Registrations and payments stay with the business as its own records.

## Finish by hand (SQL editor)

The account's contact record stays behind with its link to the account
removed. Remove it if the person never registered or booked anything:

```sql
-- 1. Find the contact record (replace the address).
select id from public.people where lower(email) = lower('person@example.com');

-- 2. Is it used by a registration? If this returns rows, STOP: the record
--    belongs to a business's registration and stays (see the policy's
--    "How long we keep it").
select id from public.registrations
 where parent_person_id = <id> or child_person_id = <id>;

-- 3. Only if step 2 returned nothing:
delete from public.people where id = <id>;
```

An unused invitation sent to that address can be removed too:

```sql
delete from public.organization_invites
 where lower(email) = lower('person@example.com') and accepted_at is null;
```

## Tell the person

Reply to say the account is closed, and that registrations and payments
already made stay with the business they were made with for the periods
in the Privacy Policy.
