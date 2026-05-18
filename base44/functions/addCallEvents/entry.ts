import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { call_id, events } = await req.json();
    if (!call_id || !Array.isArray(events) || events.length === 0) {
      return Response.json({ error: 'call_id and events[] are required' }, { status: 400 });
    }

    // Fetch the call record using service role
    const call = await base44.asServiceRole.entities.CallRecord.get(call_id);
    if (!call) {
      return Response.json({ error: 'Call not found' }, { status: 404 });
    }

    const existingEvents = call.events || [];
    const newEvents = events.map(e => ({
      id: crypto.randomUUID(),
      timestamp: e.timestamp || new Date().toISOString(),
      category: e.category,
      label: e.label,
      details: e.details || '',
      elapsed_seconds: e.elapsed_seconds || null,
    }));

    const updated = await base44.asServiceRole.entities.CallRecord.update(call_id, {
      events: [...existingEvents, ...newEvents],
    });

    return Response.json({ success: true, added: newEvents.length, call: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});