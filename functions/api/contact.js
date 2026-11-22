export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const { email, subject, message } = await request.json();

        if (!email || !subject || !message) {
            return new Response(JSON.stringify({ error: "Bitte alle Felder ausfüllen." }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!env.EMAIL_SERVICE) {
            return new Response(JSON.stringify({ error: "Service Binding EMAIL_SERVICE fehlt in den Pages-Einstellungen." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const emailPayload = {
            from: "FabixTech Kontakt <noreply@fabixtech.ch>",
            to: "support@fabixtech.ch",
            reply_to: email,
            replyTo: email,
            subject: `[Kontaktformular] ${subject}`,
            html: `
                <h2>Neue Kontaktanfrage über FabixTech.ch</h2>
                <p><strong>Absender:</strong> ${email}</p>
                <p><strong>Betreff:</strong> ${subject}</p>
                <hr>
                <p><strong>Nachricht:</strong></p>
                <p style="white-space: pre-wrap;">${message}</p>
            `
        };

        const res = await env.EMAIL_SERVICE.fetch("https://internal/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(emailPayload)
        });

        if (!res.ok) {
            const errorDetail = await res.text();
            return new Response(JSON.stringify({ error: `Worker-Fehler (${res.status}): ${errorDetail}` }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || "Interner Serverfehler" }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}