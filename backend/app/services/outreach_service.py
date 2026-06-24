import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.outreach import OutreachEmail
from app.models.prospect import Prospect

logger = logging.getLogger(__name__)

# ── Email templates per language/variant ────────────────────────────────────

_SUBJECTS: dict[str, dict[str, dict[str, str]]] = {
    "j0": {
        "A": {
            "fr": "Partenariat Bab Morocco — Proposition commerciale pour {nom}",
            "en": "Bab Morocco Partnership — Commercial Proposal for {nom}",
            "es": "Asociación Bab Morocco — Propuesta comercial para {nom}",
            "de": "Bab Morocco Partnerschaft — Geschäftsvorschlag für {nom}",
            "ar": "شراكة باب المغرب — عرض تجاري لـ {nom}",
        },
        "B": {
            "fr": "3 avantages concrets pour {nom} avec Bab Morocco",
            "en": "3 concrete benefits for {nom} with Bab Morocco",
            "es": "3 ventajas concretas para {nom} con Bab Morocco",
            "de": "3 konkrete Vorteile für {nom} mit Bab Morocco",
            "ar": "3 مزايا ملموسة لـ {nom} مع باب المغرب",
        },
        "C": {
            "fr": "Le voyageur idéal cherche {nom} — Bab Morocco peut l'y amener",
            "en": "The ideal traveller is looking for {nom} — Bab Morocco can bring them",
            "es": "El viajero ideal busca {nom} — Bab Morocco puede llevarlo allí",
            "de": "Der ideale Reisende sucht {nom} — Bab Morocco kann ihn hinbringen",
            "ar": "المسافر المثالي يبحث عن {nom} — باب المغرب يمكنه إيصاله إليك",
        },
    },
    "j3": {
        "A": {
            "fr": "Re: Partenariat Bab Morocco — avez-vous eu le temps de lire ?",
            "en": "Re: Bab Morocco Partnership — did you get a chance to read?",
            "es": "Re: Asociación Bab Morocco — ¿tuvo tiempo de leer?",
            "de": "Betr.: Bab Morocco Partnerschaft — hatten Sie Zeit zu lesen?",
            "ar": "رد: شراكة باب المغرب — هل أتيحت لكم الفرصة للقراءة؟",
        },
        "B": {
            "fr": "Un bénéfice clé que {nom} ne devrait pas manquer",
            "en": "One key benefit {nom} should not miss",
            "es": "Un beneficio clave que {nom} no debería perderse",
            "de": "Ein wesentlicher Vorteil, den {nom} nicht verpassen sollte",
            "ar": "فائدة رئيسية لا ينبغي لـ {nom} تفويتها",
        },
        "C": {
            "fr": "Dernier rappel : vos voyageurs méritent la meilleure expérience",
            "en": "Last reminder: your travellers deserve the best experience",
            "es": "Último recordatorio: sus viajeros merecen la mejor experiencia",
            "de": "Letzte Erinnerung: Ihre Reisenden verdienen das beste Erlebnis",
            "ar": "تذكير أخير: مسافروكم يستحقون أفضل تجربة",
        },
    },
    "j7": {
        "A": {
            "fr": "Dernière tentative — Partenariat Bab Morocco pour {nom}",
            "en": "Final attempt — Bab Morocco partnership for {nom}",
            "es": "Último intento — Asociación Bab Morocco para {nom}",
            "de": "Letzter Versuch — Bab Morocco Partnerschaft für {nom}",
            "ar": "المحاولة الأخيرة — شراكة باب المغرب لـ {nom}",
        },
        "B": {
            "fr": "Je ferme ce dossier vendredi — une question avant ?",
            "en": "I'm closing this file on Friday — one question before?",
            "es": "Cierro este archivo el viernes — ¿una pregunta antes?",
            "de": "Ich schließe diese Akte am Freitag — noch eine Frage davor?",
            "ar": "سأغلق هذا الملف يوم الجمعة — سؤال أخير قبل ذلك؟",
        },
        "C": {
            "fr": "Avant de partir — une opportunité unique pour {nom}",
            "en": "Before I go — a unique opportunity for {nom}",
            "es": "Antes de irme — una oportunidad única para {nom}",
            "de": "Bevor ich gehe — eine einzigartige Gelegenheit für {nom}",
            "ar": "قبل المغادرة — فرصة فريدة لـ {nom}",
        },
    },
    "j30": {
        "A": {
            "fr": "Reprise de contact — Bab Morocco & {nom}",
            "en": "Reconnecting — Bab Morocco & {nom}",
            "es": "Retomando contacto — Bab Morocco & {nom}",
            "de": "Kontaktaufnahme — Bab Morocco & {nom}",
            "ar": "استئناف التواصل — باب المغرب & {nom}",
        },
        "B": {
            "fr": "Actualité du marché : pourquoi {nom} devrait rejoindre Bab Morocco maintenant",
            "en": "Market update: why {nom} should join Bab Morocco now",
            "es": "Actualización del mercado: por qué {nom} debería unirse a Bab Morocco ahora",
            "de": "Marktupdate: Warum {nom} jetzt Bab Morocco beitreten sollte",
            "ar": "تحديث السوق: لماذا يجب على {nom} الانضمام إلى باب المغرب الآن",
        },
        "C": {
            "fr": "La saison arrive — {nom} prêt à accueillir plus de voyageurs ?",
            "en": "Season is coming — is {nom} ready to welcome more travellers?",
            "es": "La temporada llega — ¿está {nom} listo para recibir más viajeros?",
            "de": "Die Saison kommt — ist {nom} bereit, mehr Reisende zu empfangen?",
            "ar": "الموسم قادم — هل {nom} جاهز لاستقبال المزيد من المسافرين؟",
        },
    },
}

_BODIES: dict[str, dict[str, dict[str, str]]] = {
    "j0": {
        "A": {
            "fr": (
                "Bonjour,\n\n"
                "Je me permets de vous contacter au nom de Bab Morocco, une OTA 100% dédiée au Maroc en cours de lancement.\n\n"
                "Nous cherchons à établir des partenariats solides avec des établissements de qualité comme {nom}. "
                "La commission proposée est de {commission}%, avec une visibilité maximale auprès d'une clientèle européenne et du Golfe.\n\n"
                "Seriez-vous disponible pour un appel de 20 minutes cette semaine ?\n\n"
                "Cordialement,\nL'équipe Bab Morocco"
            ),
            "en": (
                "Hello,\n\n"
                "I am reaching out on behalf of Bab Morocco, an OTA 100% dedicated to Morocco, currently in its launch phase.\n\n"
                "We are looking to build strong partnerships with quality establishments such as {nom}. "
                "We offer a {commission}% commission with maximum visibility to European and Gulf clientele.\n\n"
                "Would you be available for a 20-minute call this week?\n\n"
                "Best regards,\nThe Bab Morocco Team"
            ),
            "es": (
                "Hola,\n\n"
                "Me pongo en contacto en nombre de Bab Morocco, una OTA 100% dedicada a Marruecos, actualmente en fase de lanzamiento.\n\n"
                "Buscamos establecer alianzas sólidas con establecimientos de calidad como {nom}. "
                "Ofrecemos una comisión del {commission}% con máxima visibilidad ante clientes europeos y del Golfo.\n\n"
                "¿Estaría disponible para una llamada de 20 minutos esta semana?\n\n"
                "Atentamente,\nEl equipo de Bab Morocco"
            ),
            "de": (
                "Sehr geehrte Damen und Herren,\n\n"
                "Ich melde mich im Namen von Bab Morocco, einer OTA, die zu 100% Marokko gewidmet ist und sich derzeit in der Startphase befindet.\n\n"
                "Wir möchten starke Partnerschaften mit Qualitätsbetrieben wie {nom} aufbauen. "
                "Wir bieten {commission}% Provision mit maximaler Sichtbarkeit bei europäischen und Golfkunden.\n\n"
                "Wären Sie diese Woche für ein 20-minütiges Gespräch verfügbar?\n\n"
                "Mit freundlichen Grüßen,\nDas Bab Morocco Team"
            ),
            "ar": (
                "السلام عليكم،\n\n"
                "أتواصل معكم باسم باب المغرب، منصة حجز سياحية متخصصة في المغرب وفي مرحلة الإطلاق حالياً.\n\n"
                "نسعى إلى بناء شراكات متينة مع مؤسسات متميزة مثل {nom}. "
                "نقدم عمولة {commission}% مع أقصى قدر من الظهور أمام العملاء الأوروبيين ومن دول الخليج.\n\n"
                "هل أنتم متاحون لمكالمة مدتها 20 دقيقة هذا الأسبوع؟\n\n"
                "مع التحية،\nفريق باب المغرب"
            ),
        },
        "B": {
            "fr": (
                "Bonjour,\n\n"
                "Voici 3 avantages concrets d'un partenariat avec Bab Morocco pour {nom} :\n\n"
                "1. **Nouveaux clients** : accès à une clientèle européenne et du Golfe en recherche active d'expériences authentiques au Maroc\n"
                "2. **Commission {commission}%** avec paiement sous 45 jours — parmi les meilleurs taux du marché\n"
                "3. **Badge Partenaire Fondateur** : visibilité premium au lancement pour les premiers partenaires\n\n"
                "Intéressé par un appel de 20 minutes pour en discuter ?\n\n"
                "Cordialement,\nL'équipe Bab Morocco"
            ),
            "en": (
                "Hello,\n\n"
                "Here are 3 concrete benefits of a partnership with Bab Morocco for {nom}:\n\n"
                "1. **New clients**: access to European and Gulf clientele actively seeking authentic Moroccan experiences\n"
                "2. **{commission}% commission** with payment within 45 days — among the best rates on the market\n"
                "3. **Founding Partner Badge**: premium visibility at launch for early partners\n\n"
                "Interested in a 20-minute call to discuss?\n\n"
                "Best regards,\nThe Bab Morocco Team"
            ),
            "es": (
                "Hola,\n\n"
                "Aquí le presentamos 3 ventajas concretas de una asociación con Bab Morocco para {nom}:\n\n"
                "1. **Nuevos clientes**: acceso a clientes europeos y del Golfo que buscan activamente experiencias auténticas en Marruecos\n"
                "2. **{commission}% de comisión** con pago en 45 días — de los mejores del mercado\n"
                "3. **Insignia de Socio Fundador**: visibilidad premium en el lanzamiento para los primeros socios\n\n"
                "¿Le interesa una llamada de 20 minutos para discutirlo?\n\n"
                "Atentamente,\nEl equipo de Bab Morocco"
            ),
            "de": (
                "Sehr geehrte Damen und Herren,\n\n"
                "Hier sind 3 konkrete Vorteile einer Partnerschaft mit Bab Morocco für {nom}:\n\n"
                "1. **Neue Kunden**: Zugang zu europäischen und Golfkunden, die aktiv nach authentischen marokkanischen Erlebnissen suchen\n"
                "2. **{commission}% Provision** mit Zahlung innerhalb von 45 Tagen — zu den besten Konditionen auf dem Markt\n"
                "3. **Gründungspartner-Abzeichen**: Premium-Sichtbarkeit beim Start für Erstpartner\n\n"
                "Hätten Sie Interesse an einem 20-minütigen Gespräch?\n\n"
                "Mit freundlichen Grüßen,\nDas Bab Morocco Team"
            ),
            "ar": (
                "السلام عليكم،\n\n"
                "إليكم 3 مزايا ملموسة للشراكة مع باب المغرب لـ {nom}:\n\n"
                "1. **عملاء جدد**: الوصول إلى العملاء الأوروبيين وعملاء الخليج الباحثين عن تجارب مغربية أصيلة\n"
                "2. **عمولة {commission}%** مع الدفع خلال 45 يوماً — من أفضل الأسعار في السوق\n"
                "3. **شارة الشريك المؤسس**: ظهور متميز عند الإطلاق للشركاء الأوائل\n\n"
                "هل أنتم مهتمون بمكالمة مدتها 20 دقيقة للنقاش؟\n\n"
                "مع التحية،\nفريق باب المغرب"
            ),
        },
        "C": {
            "fr": (
                "Bonjour,\n\n"
                "Imaginez ce voyageur : il a passé des semaines à rêver du Maroc. Il cherche une adresse authentique, "
                "pas un hôtel de chaîne. Il tape dans Google et tombe sur {nom}.\n\n"
                "Bab Morocco est la plateforme qui l'amène jusqu'à vous. Nous connectons les voyageurs européens et du Golfe "
                "avec les meilleures adresses marocaines — et {nom} a exactement ce qu'ils cherchent.\n\n"
                "Commission de {commission}%, paiement sous 45 jours, badge Partenaire Fondateur offert.\n\n"
                "Un appel de 20 minutes pour commencer cette belle aventure ?\n\n"
                "Avec enthousiasme,\nL'équipe Bab Morocco"
            ),
            "en": (
                "Hello,\n\n"
                "Picture this traveller: they have spent weeks dreaming of Morocco. They want an authentic address, "
                "not a chain hotel. They search online and find {nom}.\n\n"
                "Bab Morocco is the platform that brings them to your door. We connect European and Gulf travellers "
                "with the best Moroccan destinations — and {nom} is exactly what they are looking for.\n\n"
                "{commission}% commission, payment within 45 days, Founding Partner Badge included.\n\n"
                "A 20-minute call to start this journey together?\n\n"
                "With enthusiasm,\nThe Bab Morocco Team"
            ),
            "es": (
                "Hola,\n\n"
                "Imagínese a este viajero: ha pasado semanas soñando con Marruecos. Busca un lugar auténtico, "
                "no un hotel de cadena. Busca en Internet y encuentra {nom}.\n\n"
                "Bab Morocco es la plataforma que le lleva hasta usted. Conectamos a viajeros europeos y del Golfo "
                "con los mejores destinos de Marruecos — y {nom} es exactamente lo que buscan.\n\n"
                "Comisión del {commission}%, pago en 45 días, Insignia de Socio Fundador incluida.\n\n"
                "¿Una llamada de 20 minutos para iniciar esta aventura juntos?\n\n"
                "Con entusiasmo,\nEl equipo de Bab Morocco"
            ),
            "de": (
                "Sehr geehrte Damen und Herren,\n\n"
                "Stellen Sie sich diesen Reisenden vor: Er hat wochenlang von Marokko geträumt. Er sucht eine authentische Adresse, "
                "kein Kettenhotel. Er sucht im Internet und findet {nom}.\n\n"
                "Bab Morocco ist die Plattform, die ihn zu Ihnen führt. Wir verbinden europäische Reisende und Golfkunden "
                "mit den besten marokkanischen Adressen — und {nom} ist genau das, was sie suchen.\n\n"
                "{commission}% Provision, Zahlung innerhalb von 45 Tagen, Gründungspartner-Abzeichen inklusive.\n\n"
                "Ein 20-minütiges Gespräch, um dieses Abenteuer gemeinsam zu beginnen?\n\n"
                "Mit Enthusiasmus,\nDas Bab Morocco Team"
            ),
            "ar": (
                "السلام عليكم،\n\n"
                "تخيلوا هذا المسافر: قضى أسابيع يحلم بالمغرب. يبحث عن وجهة أصيلة، لا عن فندق سلسلة. "
                "يبحث على الإنترنت ويجد {nom}.\n\n"
                "باب المغرب هي المنصة التي تقوده إليكم. نربط المسافرين الأوروبيين وعملاء الخليج "
                "بأفضل الوجهات المغربية — و{nom} هو بالضبط ما يبحثون عنه.\n\n"
                "عمولة {commission}%، دفع خلال 45 يوماً، شارة الشريك المؤسس مشمولة.\n\n"
                "مكالمة مدتها 20 دقيقة لبدء هذه المغامرة معاً؟\n\n"
                "بحماس،\nفريق باب المغرب"
            ),
        },
    },
    "j3": {
        "A": {
            "fr": "Bonjour,\n\nJe reviens vers vous suite à mon email de jeudi dernier concernant un partenariat Bab Morocco pour {nom}.\n\nAvez-vous eu l'occasion de le lire ? Je reste à votre disposition pour un appel rapide.\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nFollowing up on my email from last Thursday regarding a Bab Morocco partnership for {nom}.\n\nDid you get a chance to read it? I am available for a quick call.\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nSigo en contacto sobre mi correo del jueves pasado sobre una asociación Bab Morocco para {nom}.\n\n¿Tuvo la oportunidad de leerlo? Estoy disponible para una llamada rápida.\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nIch melde mich im Anschluss an meine E-Mail vom letzten Donnerstag bezüglich einer Bab Morocco-Partnerschaft für {nom}.\n\nHatten Sie Gelegenheit, sie zu lesen? Ich stehe für ein kurzes Gespräch zur Verfügung.\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nأتابع معكم بشأن بريدي الإلكتروني من الخميس الماضي حول شراكة باب المغرب لـ {nom}.\n\nهل أتيحت لكم الفرصة لقراءته؟ أنا متاح لمكالمة سريعة.\n\nمع التحية،\nفريق باب المغرب",
        },
        "B": {
            "fr": "Bonjour,\n\nUn avantage clé que je souhaitais souligner pour {nom} : nos partenaires fondateurs bénéficient d'une commission verrouillée 12 mois, même en période de faible volume.\n\nCela représente une sécurité réelle pour votre établissement. Intéressé ?\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nOne key benefit I wanted to highlight for {nom}: our founding partners enjoy a locked-in commission for 12 months, even during low-volume periods.\n\nThis is real security for your business. Interested?\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nUna ventaja clave que quería destacar para {nom}: nuestros socios fundadores disfrutan de una comisión fija durante 12 meses, incluso en períodos de bajo volumen.\n\nEsto es seguridad real para su negocio. ¿Le interesa?\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nEinen wichtigen Vorteil wollte ich für {nom} hervorheben: Unsere Gründungspartner genießen 12 Monate lang eine festgeschriebene Provision, auch in schwachen Perioden.\n\nDas ist echte Sicherheit für Ihr Unternehmen. Interessiert?\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nميزة رئيسية أردت إبرازها لـ {nom}: شركاؤنا المؤسسون يستفيدون من عمولة مثبتة لمدة 12 شهراً، حتى في فترات الحجوزات المنخفضة.\n\nهذا أمان حقيقي لعملكم. هل أنتم مهتمون؟\n\nمع التحية،\nفريق باب المغرب",
        },
        "C": {
            "fr": "Bonjour,\n\nVos voyageurs méritent la meilleure expérience possible — et vous méritez de les accueillir dans les meilleures conditions.\n\nBab Morocco est la plateforme qui rend cela possible. Un dernier échange avant que je passe au suivant ?\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nYour travellers deserve the best possible experience — and you deserve to welcome them under the best conditions.\n\nBab Morocco is the platform that makes this possible. One last exchange before I move on?\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nSus viajeros merecen la mejor experiencia posible — y usted merece recibirlos en las mejores condiciones.\n\nBab Morocco es la plataforma que hace esto posible. ¿Un último intercambio antes de seguir adelante?\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nIhre Reisenden verdienen das bestmögliche Erlebnis — und Sie verdienen es, sie unter besten Bedingungen zu empfangen.\n\nBab Morocco ist die Plattform, die dies möglich macht. Ein letzter Austausch, bevor ich weitergehe?\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nمسافروكم يستحقون أفضل تجربة ممكنة — وأنتم تستحقون استقبالهم في أفضل الظروف.\n\nباب المغرب هي المنصة التي تجعل هذا ممكناً. تبادل أخير قبل أن أنتقل إلى غيركم؟\n\nمع التحية،\nفريق باب المغرب",
        },
    },
    "j7": {
        "A": {
            "fr": "Bonjour,\n\nC'est ma dernière tentative de contact concernant le partenariat Bab Morocco pour {nom}.\n\nSi le moment n'est pas propice, je comprends tout à fait. N'hésitez pas à revenir vers moi quand vous le souhaitez.\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nThis is my final contact attempt regarding the Bab Morocco partnership for {nom}.\n\nIf the timing is not right, I completely understand. Do not hesitate to reach out whenever you are ready.\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nEste es mi último intento de contacto sobre la asociación Bab Morocco para {nom}.\n\nSi el momento no es el adecuado, lo entiendo perfectamente. No dude en contactarme cuando esté listo.\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nDies ist mein letzter Kontaktversuch bezüglich der Bab Morocco-Partnerschaft für {nom}.\n\nWenn der Zeitpunkt nicht passt, verstehe ich das vollkommen. Zögern Sie nicht, sich zu melden, wenn Sie bereit sind.\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nهذه محاولة التواصل الأخيرة بشأن شراكة باب المغرب لـ {nom}.\n\nإذا لم يكن التوقيت مناسباً، فأنا أتفهم ذلك تماماً. لا تترددوا في التواصل معنا متى كنتم مستعدين.\n\nمع التحية،\nفريق باب المغرب",
        },
        "B": {
            "fr": "Bonjour,\n\nJe ferme ce dossier vendredi. Avant cela, une question directe : y a-t-il un obstacle spécifique qui vous retient ?\n\nSi c'est la commission, le timing, ou autre chose — je peux m'adapter. Mais si vous ne me répondez pas, je considèrerai que ce n'est pas le bon moment.\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nI am closing this file on Friday. Before that, one direct question: is there a specific obstacle holding you back?\n\nIf it is the commission, the timing, or something else — I can adapt. But if you do not reply, I will consider this is not the right time.\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nCierro este expediente el viernes. Antes de eso, una pregunta directa: ¿hay algún obstáculo específico que le frena?\n\nSi es la comisión, el momento o algo más, puedo adaptarme. Pero si no me responde, consideraré que no es el momento adecuado.\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nIch schließe diese Akte am Freitag. Davor eine direkte Frage: Gibt es ein spezifisches Hindernis, das Sie zurückhält?\n\nWenn es die Provision, der Zeitpunkt oder etwas anderes ist — ich kann mich anpassen. Wenn Sie jedoch nicht antworten, werde ich davon ausgehen, dass dies nicht der richtige Zeitpunkt ist.\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nسأغلق هذا الملف يوم الجمعة. قبل ذلك، سؤال مباشر: هل هناك عائق محدد يمنعكم؟\n\nإذا كان الأمر يتعلق بالعمولة أو التوقيت أو شيء آخر — يمكنني التكيف. لكن إذا لم تردوا، سأعتبر أن الوقت غير مناسب.\n\nمع التحية،\nفريق باب المغرب",
        },
        "C": {
            "fr": "Bonjour,\n\nAvant de partir, je voulais partager une dernière pensée : les partenaires qui rejoignent Bab Morocco maintenant bénéficient d'une visibilité incomparable au lancement.\n\nCette opportunité est limitée. Elle ne sera plus disponible après notre ouverture.\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nBefore I go, I wanted to share one last thought: partners who join Bab Morocco now benefit from unmatched visibility at launch.\n\nThis opportunity is limited. It will no longer be available after our opening.\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nAntes de irme, quería compartir un último pensamiento: los socios que se unen a Bab Morocco ahora se benefician de una visibilidad incomparable en el lanzamiento.\n\nEsta oportunidad es limitada. Ya no estará disponible después de nuestra apertura.\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nBevor ich gehe, möchte ich einen letzten Gedanken teilen: Partner, die jetzt Bab Morocco beitreten, profitieren beim Start von unübertroffener Sichtbarkeit.\n\nDiese Gelegenheit ist begrenzt. Nach unserer Eröffnung wird sie nicht mehr verfügbar sein.\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nقبل المغادرة، أردت مشاركة فكرة أخيرة: الشركاء الذين ينضمون إلى باب المغرب الآن يستفيدون من ظهور لا مثيل له عند الإطلاق.\n\nهذه الفرصة محدودة. لن تكون متاحة بعد افتتاحنا.\n\nمع التحية،\nفريق باب المغرب",
        },
    },
    "j30": {
        "A": {
            "fr": "Bonjour,\n\nNous nous étions contactés il y a un mois concernant un partenariat pour {nom}. Le contexte a peut-être évolué depuis.\n\nBab Morocco se rapproche de son lancement — c'est le bon moment pour rejoindre l'aventure.\n\nToujours intéressé ?\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nWe were in touch a month ago regarding a partnership for {nom}. The context may have changed since then.\n\nBab Morocco is approaching its launch — now is the right time to join the adventure.\n\nStill interested?\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nEstuvimos en contacto hace un mes sobre una asociación para {nom}. El contexto puede haber cambiado desde entonces.\n\nBab Morocco se acerca a su lanzamiento — ahora es el momento adecuado para unirse a la aventura.\n\n¿Sigue interesado?\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nVor einem Monat standen wir wegen einer Partnerschaft für {nom} in Kontakt. Der Kontext hat sich seitdem möglicherweise geändert.\n\nBab Morocco nähert sich seinem Start — jetzt ist der richtige Zeitpunkt, um sich dem Abenteuer anzuschließen.\n\nNoch interessiert?\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nتواصلنا معكم منذ شهر بشأن شراكة لـ {nom}. ربما تغير السياق منذ ذلك الحين.\n\nباب المغرب تقترب من إطلاقها — الآن هو الوقت المناسب للانضمام إلى المغامرة.\n\nهل لا تزالون مهتمين؟\n\nمع التحية،\nفريق باب المغرب",
        },
        "B": {
            "fr": "Bonjour,\n\nActualité du marché : la demande touristique pour le Maroc est en forte hausse ce trimestre. C'est le meilleur moment pour {nom} de se positionner sur les marchés européens et du Golfe.\n\nBab Morocco lance bientôt — les places partenaires fondateurs sont limitées.\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nMarket update: tourist demand for Morocco is rising sharply this quarter. This is the best time for {nom} to position itself in European and Gulf markets.\n\nBab Morocco launches soon — founding partner slots are limited.\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nActualización del mercado: la demanda turística de Marruecos está aumentando considerablemente este trimestre. Es el mejor momento para que {nom} se posicione en los mercados europeos y del Golfo.\n\nBab Morocco lanza pronto — los puestos de socios fundadores son limitados.\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nMarktupdate: Die touristische Nachfrage nach Marokko steigt in diesem Quartal stark. Dies ist der beste Zeitpunkt für {nom}, sich auf europäischen und Golfmärkten zu positionieren.\n\nBab Morocco startet bald — die Gründungspartner-Plätze sind begrenzt.\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nتحديث السوق: الطلب السياحي على المغرب في ارتفاع حاد هذا الربع. الآن أفضل وقت لـ {nom} لتتموضع في الأسواق الأوروبية وأسواق الخليج.\n\nباب المغرب تطلق قريباً — أماكن الشركاء المؤسسين محدودة.\n\nمع التحية،\nفريق باب المغرب",
        },
        "C": {
            "fr": "Bonjour,\n\nLa haute saison approche. Des milliers de voyageurs planifient déjà leur séjour au Maroc.\n\nEst-ce que {nom} sera prêt à les accueillir via Bab Morocco ? C'est la question que je vous pose ce mois-ci.\n\nCordialement,\nL'équipe Bab Morocco",
            "en": "Hello,\n\nHigh season is approaching. Thousands of travellers are already planning their stay in Morocco.\n\nWill {nom} be ready to welcome them via Bab Morocco? That is the question I ask you this month.\n\nBest regards,\nThe Bab Morocco Team",
            "es": "Hola,\n\nSe acerca la temporada alta. Miles de viajeros ya están planificando su estancia en Marruecos.\n\n¿Estará {nom} listo para recibirlos a través de Bab Morocco? Esa es la pregunta que le hago este mes.\n\nAtentamente,\nEl equipo de Bab Morocco",
            "de": "Sehr geehrte Damen und Herren,\n\nDie Hochsaison naht. Tausende von Reisenden planen bereits ihren Aufenthalt in Marokko.\n\nWird {nom} bereit sein, sie über Bab Morocco zu empfangen? Das ist die Frage, die ich Ihnen diesen Monat stelle.\n\nMit freundlichen Grüßen,\nDas Bab Morocco Team",
            "ar": "السلام عليكم،\n\nالموسم المرتفع يقترب. آلاف المسافرين يخططون بالفعل لإقامتهم في المغرب.\n\nهل سيكون {nom} جاهزاً لاستقبالهم عبر باب المغرب؟ هذا هو السؤال الذي أطرحه عليكم هذا الشهر.\n\nمع التحية،\nفريق باب المغرب",
        },
    },
}

_STEP_OFFSETS = {"j0": 0, "j3": 3, "j7": 7, "j30": 30}


class MockEmailSender:
    async def send(self, email: OutreachEmail) -> bool:
        logger.info(
            "[MOCK EMAIL SENT] → %s | %s | Variant %s",
            email.prospect.email_contact,
            email.sujet,
            email.variant,
        )
        return True


def _render(template: str, nom: str, commission: float) -> str:
    return template.format(nom=nom, commission=commission)


def _generate_email(
    prospect: Prospect,
    step: str,
    variant: str,
    base_date: date,
) -> dict:
    langue = prospect.langue
    offset = _STEP_OFFSETS[step]
    sujet = _render(_SUBJECTS[step][variant].get(langue, _SUBJECTS[step][variant]["en"]), prospect.nom, prospect.commission_standard)
    corps = _render(_BODIES[step][variant].get(langue, _BODIES[step][variant]["en"]), prospect.nom, prospect.commission_standard)
    return {
        "id": uuid.uuid4(),
        "prospect_id": prospect.id,
        "sequence_step": step,
        "variant": variant,
        "langue": langue,
        "sujet": sujet,
        "corps": corps,
        "statut": "draft",
        "date_envoi_prevu": base_date + timedelta(days=offset),
        "created_at": datetime.utcnow(),
    }


class OutreachService:
    def __init__(self, sender: Optional[MockEmailSender] = None):
        self._sender = sender or MockEmailSender()

    async def generate_j0_variants(
        self, db: AsyncSession, prospect: Prospect
    ) -> list[OutreachEmail]:
        today = date.today()
        emails = []
        for variant in ("A", "B", "C"):
            data = _generate_email(prospect, "j0", variant, today)
            email = OutreachEmail(**data)
            db.add(email)
            emails.append(email)
        await db.commit()
        for e in emails:
            await db.refresh(e)
        return emails

    async def list_emails(
        self, db: AsyncSession, prospect_id: uuid.UUID
    ) -> list[OutreachEmail]:
        result = await db.execute(
            select(OutreachEmail)
            .where(OutreachEmail.prospect_id == prospect_id)
            .order_by(OutreachEmail.date_envoi_prevu)
        )
        return list(result.scalars().all())

    async def next_step(
        self, db: AsyncSession, prospect_id: uuid.UUID
    ) -> dict:
        emails = await self.list_emails(db, prospect_id)
        if not emails:
            return {"next_step": "j0", "reason": "No emails yet — start with J0", "emails": []}
        sent = [e for e in emails if e.statut in ("sent", "opened", "clicked")]
        if not sent:
            validated = [e for e in emails if e.statut == "validated"]
            if validated:
                return {"next_step": None, "reason": "Emails generated, awaiting validation/send", "emails": emails}
            return {"next_step": None, "reason": "Emails in draft — validate before sending", "emails": emails}
        last_sent = max(sent, key=lambda e: e.date_envoi_reel or datetime.min)
        steps_order = ["j0", "j3", "j7", "j30"]
        current_idx = steps_order.index(last_sent.sequence_step)
        if last_sent.statut in ("opened", "clicked"):
            return {"next_step": None, "reason": "Prospect engaged — no follow-up needed", "emails": emails}
        if current_idx < len(steps_order) - 1:
            return {"next_step": steps_order[current_idx + 1], "reason": f"{last_sent.sequence_step} sent but not opened", "emails": emails}
        return {"next_step": None, "reason": "Sequence complete", "emails": emails}

    async def validate(
        self, db: AsyncSession, email_id: uuid.UUID
    ) -> OutreachEmail:
        email = await db.get(OutreachEmail, email_id)
        if not email:
            raise ValueError("Email not found")
        email.statut = "validated"
        await db.commit()
        await db.refresh(email)
        return email

    async def send(
        self, db: AsyncSession, email_id: uuid.UUID
    ) -> OutreachEmail:
        email = await db.get(OutreachEmail, email_id)
        if not email:
            raise ValueError("Email not found")
        if email.statut != "validated":
            raise PermissionError("Email must be validated before sending")
        # Load relationship
        prospect = await db.get(Prospect, email.prospect_id)
        email.prospect = prospect  # type: ignore[assignment]
        await self._sender.send(email)
        email.statut = "sent"
        email.date_envoi_reel = datetime.utcnow()
        await db.commit()
        await db.refresh(email)
        return email

    async def trigger_followups(self, db: AsyncSession) -> dict:
        today = date.today()
        created = []
        steps_order = ["j0", "j3", "j7", "j30"]

        # Find all j0 emails that were sent but not opened — candidates for j3/j7
        result = await db.execute(
            select(OutreachEmail).where(
                OutreachEmail.sequence_step == "j0",
                OutreachEmail.statut == "sent",
            )
        )
        j0_sent = list(result.scalars().all())

        for j0 in j0_sent:
            next_step = "j3"
            offset = 3
            # check if j3 already exists
            existing = await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == j0.prospect_id,
                    OutreachEmail.sequence_step == next_step,
                )
            )
            if existing.scalars().first():
                continue
            if j0.date_envoi_reel and (datetime.utcnow() - j0.date_envoi_reel).days >= offset:
                prospect = await db.get(Prospect, j0.prospect_id)
                if prospect:
                    data = _generate_email(prospect, next_step, j0.variant, j0.date_envoi_prevu)
                    email = OutreachEmail(**data)
                    db.add(email)
                    created.append({"prospect_id": str(j0.prospect_id), "step": next_step})

        # j3 → j7
        result = await db.execute(
            select(OutreachEmail).where(
                OutreachEmail.sequence_step == "j3",
                OutreachEmail.statut == "sent",
            )
        )
        j3_sent = list(result.scalars().all())
        for j3 in j3_sent:
            existing = await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == j3.prospect_id,
                    OutreachEmail.sequence_step == "j7",
                )
            )
            if existing.scalars().first():
                continue
            if j3.date_envoi_reel and (datetime.utcnow() - j3.date_envoi_reel).days >= 4:
                prospect = await db.get(Prospect, j3.prospect_id)
                if prospect:
                    data = _generate_email(prospect, "j7", j3.variant, j3.date_envoi_prevu)
                    email = OutreachEmail(**data)
                    db.add(email)
                    created.append({"prospect_id": str(j3.prospect_id), "step": "j7"})

        # veille prospects → j30
        result = await db.execute(
            select(Prospect).where(Prospect.stage == "veille")
        )
        veille_prospects = list(result.scalars().all())
        for prospect in veille_prospects:
            existing = await db.execute(
                select(OutreachEmail).where(
                    OutreachEmail.prospect_id == prospect.id,
                    OutreachEmail.sequence_step == "j30",
                )
            )
            if existing.scalars().first():
                continue
            data = _generate_email(prospect, "j30", "A", today)
            email = OutreachEmail(**data)
            db.add(email)
            created.append({"prospect_id": str(prospect.id), "step": "j30"})

        await db.commit()
        return {"created": len(created), "details": created}
