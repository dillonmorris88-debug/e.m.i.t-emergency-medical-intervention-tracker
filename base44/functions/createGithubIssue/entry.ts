import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, body, repo } = await req.json();
    if (!title || !repo) {
      return Response.json({ error: 'title and repo are required' }, { status: 400 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    // repo format: "owner/repo-name"
    const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        labels: ['clinical-bug', 'emit'],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return Response.json({ error: data.message || 'GitHub API error' }, { status: response.status });
    }

    return Response.json({ issue_number: data.number, url: data.html_url });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});