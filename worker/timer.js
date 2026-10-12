// Cloudflare Worker that wakes the "Update data" workflow every 10 minutes.
//
// GitHub's own schedule is best effort and can go hours without running, so this
// cron trigger (set in the Worker's settings to */10 * * * *) does the waking
// instead. GitHub's schedule stays on as an hourly backup.
//
// It needs one secret, GH_TOKEN: a fine-grained token limited to the parc-ferme
// repo with only "Actions: read and write". It can start this repo's workflows
// and nothing else.

const DISPATCH = "https://api.github.com/repos/t4zc4t/parc-ferme/actions/workflows/update.yml/dispatches";

export default {
  async scheduled(event, env, ctx) {
    const res = await fetch(DISPATCH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "parc-ferme-timer",
      },
      // force off: the workflow itself decides whether there's anything to do
      body: JSON.stringify({ ref: "main", inputs: { force: false } }),
    });
    if (res.status !== 204) {
      throw new Error(`GitHub said ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  },

  // nothing to see over HTTP
  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
