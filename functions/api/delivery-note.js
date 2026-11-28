function parseCookie(cookieString, key) {
    if (!cookieString) return null;
    const match = cookieString.match(new RegExp('(^| )' + key + '=([^;]+)'));
    return match ? match[2] : null;
}

async function checkAdminAuth(context) {
    const { request, env } = context;
    
    const cookieHeader = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';
    
    let sessionId = parseCookie(cookieHeader, 'session_id');
    if (!sessionId && authHeader.startsWith('Bearer ')) {
        sessionId = authHeader.substring(7).trim();
    }

    if (!sessionId) {
        return false;
    }

    const user = await env.DB.prepare(`
        SELECT is_admin 
        FROM users 
        WHERE session_id = ?
    `).bind(sessionId).first();

    return user && user.is_admin === 1;
}

const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
    return new Response(null, { headers: corsHeaders });
}

export async function onRequestGet(context) {
    const isAdmin = await checkAdminAuth(context);
    if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Zugriff verweigert" }), { 
            status: 401,
            headers: corsHeaders
        });
    }

    const url = new URL(context.request.url);
    const orderId = url.searchParams.get('id');

    if (!orderId) {
        return new Response(JSON.stringify({ error: "Bestell-ID fehlt" }), { 
            status: 400,
            headers: corsHeaders
        });
    }

    const order = await context.env.DB.prepare(
        "SELECT * FROM orders WHERE id = ?"
    ).bind(orderId).first();

    if (!order) {
        return new Response(JSON.stringify({ error: "Bestellung nicht gefunden" }), { 
            status: 404,
            headers: corsHeaders
        });
    }

    const { results: items } = await context.env.DB.prepare(
        "SELECT * FROM order_items WHERE order_id = ?"
    ).bind(order.id).all();

    const { results: variants } = await context.env.DB.prepare(
        "SELECT id, name, material FROM product_variants"
    ).all();

    const materialsSet = new Set();
    let hasOnlyGiftCards = items.length > 0;

    items.forEach(item => {
        const pName = (item.product_name || '').toLowerCase();
        if (!pName.includes('gutschein') && !pName.includes('gift')) {
            hasOnlyGiftCards = false;
        }
        const matchedVar = variants.find(v => v.id === item.variant_id || v.name === item.variant);
        if (matchedVar && matchedVar.material) {
            materialsSet.add(matchedVar.material);
        }
    });

    const detectedMaterials = materialsSet.size > 0 ? Array.from(materialsSet).join(', ') : 'PLA';

    return new Response(JSON.stringify({
        order,
        items,
        shippingCost: hasOnlyGiftCards ? 0.00 : 5.90,
        hasOnlyGiftCards,
        materials: detectedMaterials
    }), {
        headers: corsHeaders
    });
}