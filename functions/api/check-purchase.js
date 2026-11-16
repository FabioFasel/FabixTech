export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const email = url.searchParams.get('email');
    const productId = url.searchParams.get('productId');

    if (!email || !productId) {
        return new Response(JSON.stringify({ hasBought: false }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const product = await env.DB.prepare(
            "SELECT title FROM products WHERE base_id = ?"
        ).bind(productId).first();

        const cleanEmail = email.trim().toLowerCase();
        const cleanId = productId.trim().toLowerCase();
        const cleanTitle = product && product.title ? product.title.trim().toLowerCase() : cleanId;

        const hasBought = await env.DB.prepare(`
            SELECT oi.id FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE LOWER(TRIM(o.customer_email)) = ?
              AND (o.status IS NULL OR o.status != 'Storniert')
              AND (LOWER(oi.product_name) LIKE ? OR LOWER(oi.product_name) LIKE ?)
        `).bind(cleanEmail, `%${cleanTitle}%`, `%${cleanId}%`).first();

        return new Response(JSON.stringify({ hasBought: Boolean(hasBought) }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ hasBought: false }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }
}