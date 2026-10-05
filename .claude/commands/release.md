Prepare the current branch for merge:

1. `git fetch origin && git rebase origin/main`; resolve conflicts; renumber any migration that clashes.
2. `npm run lint && npm test`. If `supabase/migrations` changed, also `npm run test:integration`.
3. Use the `reviewer` agent on `git diff origin/main...HEAD`. Stop if it says "Do not merge".
4. If the diff touches booking, registration, payments, sign-in or the demo, use the `qa-runner` agent against the preview URL: $ARGUMENTS
5. Write the PR description: what changed in plain words, migrations, env var names (never values), tests run, and the 375px screenshots. End it with the attribution lines this session requires. Print the PR description and stop. Do not merge.
