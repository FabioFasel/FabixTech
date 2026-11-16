async function verifyAdmin(request, env) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const authHeader = request.headers.get('Authorization') || '';

    let sessionId = null;
    const match = cookieHeader.match(/(?:^|; )session_id=([^;]*)/);
    if (match) {
        sessionId = decodeURIComponent(match[1]);
    } else if (authHeader.startsWith('Bearer ')) {
        sessionId = authHeader.substring(7).trim();
    }

    if (!sessionId) return false;

    try {
        const user = await env.DB.prepare(
            "SELECT is_admin FROM users WHERE session_id = ?"
        ).bind(sessionId).first();

        return user && (user.is_admin === 1 || user.is_admin === true);
    } catch (e) {
        return false;
    }
}

async function getSessionUser(request, env) {
    const cookieHeader = request.headers.get('Cookie') || '';
    const match = cookieHeader.match(/(?:^|; )session_id=([^;]*)/);
    if (!match) return null;
    const sessionId = decodeURIComponent(match[1]);
    try {
        const user = await env.DB.prepare("SELECT email, is_admin FROM users WHERE session_id = ?").bind(sessionId).first();
        return user || null;
    } catch (e) {
        return null;
    }
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const productId = url.searchParams.get('productId');

    if (!productId) {
        return new Response(JSON.stringify({ error: "Produkt-ID fehlt" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        const { results: reviews } = await env.DB.prepare(`
            SELECT r.*, u.profile_picture 
            FROM reviews r
            LEFT JOIN users u ON r.user_email = u.email
            WHERE r.product_id = ? 
            ORDER BY r.created_at DESC
        `).bind(productId).all();

        const total = reviews.length;
        let sum = 0;
        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

        reviews.forEach(r => {
            sum += r.rating;
            if (breakdown[r.rating] !== undefined) {
                breakdown[r.rating]++;
            }
        });

        const average = total > 0 ? sum / total : 0;

        return new Response(JSON.stringify({
            average,
            total,
            breakdown,
            reviews
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const data = await request.json();
        
        if (data.action === 'admin_reply') {
            const { reviewId, admin_reply } = data;
            
            const isAdmin = await verifyAdmin(request, env);
            if (!isAdmin) {
                return new Response(JSON.stringify({ error: "Keine Administrator-Rechte." }), { 
                    status: 403, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            await env.DB.prepare(`UPDATE reviews SET admin_reply = ? WHERE id = ?`).bind(admin_reply, reviewId).run();
            return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
        }

        if (data.action === 'vote') {
            const { reviewId, type } = data;
            if (type !== 'yes' && type !== 'no') {
                return new Response(JSON.stringify({ error: "Ungültiger Typ" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
            }

            const user = await getSessionUser(request, env);
            if (!user) {
                return new Response(JSON.stringify({ error: "Bitte melde dich an, um abzustimmen." }), { 
                    status: 401, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }

            await env.DB.prepare(`
                CREATE TABLE IF NOT EXISTS review_votes (
                    review_id INTEGER,
                    user_email TEXT,
                    vote_type TEXT,
                    PRIMARY KEY (review_id, user_email)
                )
            `).run();

            const existingVote = await env.DB.prepare(
                `SELECT vote_type FROM review_votes WHERE review_id = ? AND user_email = ?`
            ).bind(reviewId, user.email).first();

            let deltaYes = 0;
            let deltaNo = 0;

            if (existingVote) {
                if (existingVote.vote_type === type) {
                    await env.DB.prepare(
                        `DELETE FROM review_votes WHERE review_id = ? AND user_email = ?`
                    ).bind(reviewId, user.email).run();

                    if (type === 'yes') deltaYes = -1;
                    if (type === 'no') deltaNo = -1;
                } else {
                    await env.DB.prepare(
                        `UPDATE review_votes SET vote_type = ? WHERE review_id = ? AND user_email = ?`
                    ).bind(type, reviewId, user.email).run();

                    if (type === 'yes') { deltaYes = 1; deltaNo = -1; }
                    if (type === 'no') { deltaYes = -1; deltaNo = 1; }
                }
            } else {
                await env.DB.prepare(
                    `INSERT INTO review_votes (review_id, user_email, vote_type) VALUES (?, ?, ?)`
                ).bind(reviewId, user.email, type).run();

                if (type === 'yes') deltaYes = 1;
                if (type === 'no') deltaNo = 1;
            }

            if (deltaYes !== 0 || deltaNo !== 0) {
                await env.DB.prepare(`
                    UPDATE reviews 
                    SET helpful_yes = MAX(0, helpful_yes + ?),
                        helpful_no = MAX(0, helpful_no + ?)
                    WHERE id = ?
                `).bind(deltaYes, deltaNo, reviewId).run();
            }

            const updated = await env.DB.prepare(
                `SELECT helpful_yes, helpful_no FROM reviews WHERE id = ?`
            ).bind(reviewId).first();

            return new Response(JSON.stringify({ 
                success: true, 
                helpful_yes: updated ? updated.helpful_yes : 0,
                helpful_no: updated ? updated.helpful_no : 0,
                userVote: existingVote && existingVote.vote_type === type ? null : type
            }), { headers: { 'Content-Type': 'application/json' } });
        }

        const { productId, user_email, customer_name, rating, title, comment, pros, cons } = data;

        if (!productId || !user_email || !rating || !title) {
            return new Response(JSON.stringify({ error: "Pflichtfelder fehlen" }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const product = await env.DB.prepare(
            "SELECT title FROM products WHERE base_id = ?"
        ).bind(productId).first();

        const productTitle = product ? product.title : productId;

        const hasBought = await env.DB.prepare(`
            SELECT oi.id FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE LOWER(o.customer_email) = LOWER(?) 
              AND (LOWER(oi.product_name) LIKE LOWER(?) OR LOWER(oi.product_name) LIKE LOWER(?))
        `).bind(user_email.trim(), `%${productTitle}%`, `%${productId}%`).first();

        if (!hasBought) {
            return new Response(JSON.stringify({ error: "Du kannst dieses Produkt nur bewerten, wenn du es gekauft hast." }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        await env.DB.prepare(`
            INSERT INTO reviews (product_id, user_email, customer_name, rating, title, comment, pros, cons, helpful_yes, helpful_no)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        `).bind(
            productId,
            user_email,
            customer_name || 'Kunde',
            parseInt(rating),
            title,
            comment || '',
            pros || '',
            cons || ''
        ).run();

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}