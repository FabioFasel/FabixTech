const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

export async function onRequestOptions() {
    return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet({ request, env }) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';

    let sessionId = null;
    const match = cookieHeader.match(/(?:^|; )session_id=([^;]*)/);
    if (match) {
        sessionId = decodeURIComponent(match[1]);
    } else if (authHeader.startsWith('Bearer ')) {
        sessionId = authHeader.substring(7).trim();
    }

    if (!sessionId) {
        return new Response(JSON.stringify({ valid: false }), { status: 401, headers: corsHeaders });
    }

    try {
        const user = await env.DB.prepare(
            "SELECT email, is_admin FROM users WHERE session_id = ?"
        ).bind(sessionId).first();

        if (!user) {
            return new Response(JSON.stringify({ valid: false }), { status: 401, headers: corsHeaders });
        }

        return new Response(JSON.stringify({
            valid: true,
            isAdmin: user.is_admin === 1 || user.is_admin === true
        }), { headers: corsHeaders });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
}