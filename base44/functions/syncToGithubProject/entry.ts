import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const GITHUB_LOGIN = 'Dillonmorris88-debug';
const PROJECT_NUMBER = 1;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { call } = await req.json();
    if (!call) return Response.json({ error: 'Missing call data' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('github');

    // Step 1: Get the project node ID
    const projectQuery = `
      query {
        user(login: "${GITHUB_LOGIN}") {
          projectV2(number: ${PROJECT_NUMBER}) {
            id
          }
        }
      }
    `;

    const projectRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: projectQuery }),
    });

    const projectData = await projectRes.json();
    const projectId = projectData?.data?.user?.projectV2?.id;
    if (!projectId) {
      return Response.json({ error: 'Project not found', details: projectData }, { status: 404 });
    }

    // Build analytics summary
    const events = call.events || [];
    const interventions = events.filter(e => e.category === 'intervention');
    const medications = events.filter(e => e.category === 'medication');
    const rhythms = events.filter(e => e.category === 'rhythm');
    const cprEvent = events.find(e => e.label === 'CPR Started');
    const outcome = call.rosc ? 'ROSC' : call.discontinued ? 'Discontinued' : 'Active';

    let durationStr = 'N/A';
    if (call.started_at && call.ended_at) {
      const secs = Math.floor((new Date(call.ended_at) - new Date(call.started_at)) / 1000);
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      durationStr = `${m}m ${s}s`;
    }

    const title = `Call ${call.call_number || call.id?.slice(0, 8) || 'Unknown'} — ${outcome} — ${new Date(call.started_at).toLocaleDateString()}`;

    const body = [
      `**Outcome:** ${outcome}`,
      `**Duration:** ${durationStr}`,
      `**CPR Started:** ${cprEvent ? new Date(cprEvent.timestamp).toLocaleTimeString() : 'No'}`,
      `**Interventions (${interventions.length}):** ${interventions.map(e => e.label).join(', ') || 'None'}`,
      `**Medications (${medications.length}):** ${medications.map(e => e.label).join(', ') || 'None'}`,
      `**Rhythms:** ${rhythms.map(e => e.label.replace('Rhythm: ', '')).join(' → ') || 'None'}`,
    ].join('\n');

    const cardBody = `${title}\n\n${body}`;

    // Step 2: Add a draft item to the project
    const addMutation = `
      mutation {
        addProjectV2DraftIssue(input: {
          projectId: "${projectId}",
          title: ${JSON.stringify(title)},
          body: ${JSON.stringify(body)}
        }) {
          projectItem {
            id
          }
        }
      }
    `;

    const addRes = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: addMutation }),
    });

    const addData = await addRes.json();
    const itemId = addData?.data?.addProjectV2DraftIssue?.projectItem?.id;

    if (!itemId) {
      return Response.json({ error: 'Failed to add item', details: addData }, { status: 500 });
    }

    return Response.json({ success: true, itemId, title });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});