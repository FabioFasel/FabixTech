export async function onRequestGet(context) {
    try {
        const { results } = await context.env.DB.prepare(
            "SELECT id, stock, COALESCE(ignore_stock, 0) AS ignore_stock FROM product_variants"
        ).all();

        return new Response(JSON.stringify(results), {
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=10'
            }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}