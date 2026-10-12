// starts update.yml every 10 min (cron trigger set in cloudflare)
// GH_TOKEN: fine-grained, this repo only, actions read/write

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
      body: JSON.stringify({ ref: "main", inputs: { force: false } }),
    });
    if (res.status !== 204) {
      throw new Error(`github said ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
  },

  async fetch() {
    return new Response("Not found", { status: 404 });
  },
};
