---
title: Rotate an API key without downtime
planted:
  - initials: KMS
  - prereq: Before you begin
  - step-ref: step 6
  - vague-step: Restart the service
  - terminology: token
  - plain: Prior to
  - spatial-ref: figure below
  - vague-pointer: As discussed above
---
> ✎ This is an example guide, and it's yours: the words in [brackets] are blanks for your own, and the lines marked ✎ are a tour of what Clearpen does. Press ⌘⇧E to review it. Delete it all when you're done.

[Your service] signs every request with an API key. This guide shows you how to create a second key, move your callers onto it and retire the first, with no request failing in between. It is written for engineers who already run [the service] and can change its configuration.

## Before you begin

You need:

- An account on [the console] with the Owner role.
- Access to the KMS, where the keys are stored.

> ✎ Review reads this section against the steps below it: they run a command this list never mentions, and the KMS is never spelled out. Click the word count for Insights, where Terms lists each thing the draft defines and every name used for it.

## Create the second key

1. Sign in to [the console] and open Settings → API keys.
2. Click New key and give it a name that says where it is used, such as `billing-worker`.
3. Copy the key. It is shown once.
4. Store it in the KMS beside the old one, with `-next` on the end of its path:

```bash
vaultctl put secret/billing/api-key-next --value "<YOUR_NEW_KEY>"
```

> ✎ The steps run `vaultctl`, and the section above never says to install it, or which version: Review leaves that note on its heading.

## Move the callers

Each caller reads its key when it starts, so a caller that is restarted after the previous section picks up the new key from the KMS, provided that its configuration, which the deployment guide describes and which in most installations lives in the environment rather than in a file, points at the `-next` path.

> ✎ Select that sentence and choose Clarify. It is reordered so that each sentence opens on what the one before established, and the long aside gets a sentence of its own. Nothing is shortened and nothing is added to the sentence; only the words that change are marked.

1. Point the caller at the `-next` path.
2. Restart the service.
3. Watch its logs for a minute, as in step 6 above, before you move the next caller. Paste the token into the request log filter to see only its calls.

> ✎ Two of these steps can't be followed as written, and Review says why: one names no service and no command, and one points at a step this list hasn't got. It also notes that the draft calls one thing by two names.

## Retire the old key

Prior to deleting the old key, check that no caller still uses it. As discussed above, the old key keeps working until you delete it, so there is no rush.

> ✎ Review also checks the signposts in a guide or a paper: “above” with no section named sends the reader hunting, and the note names the section it could point to. Select a passage and choose Check ▾ → Check consistency to compare it with the rest of the draft.

The figure below shows the two keys side by side, with the calls each one received in the last hour.

![The two keys and their calls in the last hour]([your-screenshot.png])

> ✎ A pointer at a position stops being true when the page is laid out again: number the figure.

Delete the old key from [the console], then from the KMS.
