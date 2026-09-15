import 'dotenv/config';
import { Kafka, logLevel } from 'kafkajs';

/**
 * FR-207 : consommateur de démonstration tenant lieu de SDO (planification), hors périmètre.
 * Affiche l'en-tête `eventType` posé par le routeur Debezium et le payload de l'événement.
 *
 * L'application ne produit jamais sur Kafka (ADR 0003) : ce script ne fait que lire ce que
 * Debezium a publié depuis `outbox_event`.
 */

const BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const TOPIC = process.env.KAFKA_TOPIC ?? 'poseo.quote';
const GROUP_ID = process.env.KAFKA_GROUP_ID ?? 'poseo-demo-consumer';

async function main(): Promise<void> {
  const kafka = new Kafka({
    clientId: 'poseo-demo-consumer',
    brokers: BROKERS,
    logLevel: logLevel.ERROR,
  });

  const consumer = kafka.consumer({ groupId: GROUP_ID });

  const stop = async (): Promise<void> => {
    await consumer.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

  console.log(`En écoute sur ${TOPIC} (${BROKERS.join(', ')}). Ctrl+C pour arrêter.`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      // `eventType` vient de `transforms.outbox.table.fields.additional.placement`,
      // la clé du message est `aggregateid` (voir debezium/outbox-connector.json).
      const eventType = message.headers?.eventType?.toString() ?? '(sans type)';
      const key = message.key?.toString() ?? '(sans clé)';
      const raw = message.value?.toString() ?? 'null';

      // Le routeur Debezium rend la colonne `payload` (jsonb) sous forme de chaîne JSON :
      // un premier parse donne cette chaîne, un second l'objet.
      let payload: unknown = raw;
      try {
        payload = JSON.parse(raw);
        if (typeof payload === 'string') payload = JSON.parse(payload);
      } catch {
        // Un payload illisible est affiché tel quel plutôt que de couper la boucle.
      }

      console.log(`\n${eventType}  clé=${key}`);
      console.log(JSON.stringify(payload, null, 2));
    },
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
