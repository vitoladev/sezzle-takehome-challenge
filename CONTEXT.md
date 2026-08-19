# Domain Glossary

The ubiquitous language for this project. Every domain term used in issues, code, and PRs gets an entry here **before** the issue that introduces it ships — the `task-orchestrator` skill hands these entries to implementation agents as context.

Each entry: the term as a heading, then one or two paragraphs saying what it is, what owns it, and any lifecycle or invariant that constrains it. Write definitions in the product's language, not the implementation's.

<!-- Example shape (delete once real entries exist):

## Order

A customer's request to purchase one Item. Has a lifecycle: `draft → placed → fulfilled`. A placed Order is immutable — corrections happen through a new Order that references the original.

-->
