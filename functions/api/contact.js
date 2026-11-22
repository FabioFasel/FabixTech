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

        const emailPayload = {
            to: "support@fabixtech.ch",
            reply_to: email,
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
            throw new Error("Fehler beim internen E-Mail-Versand");
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (err) {
        console.error("Kontaktformular-Fehler:", err);
        return new Response(JSON.stringify({ error: "Nachricht konnte nicht gesendet werden." }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}