import Airtable from "airtable";
import { config } from "../../config";
import { logger } from "../../logger";
import { PromptLogBackend, PromptLogEntry } from "..";

const log = logger.child({ module: "airtable" });

const base = new Airtable({ apiKey: config.airtableApiKey }).base(
  config.airtableBaseId
);

const appendBatch = async (batch: PromptLogEntry[]) => {
  const records = batch.map((entry) => ({
    fields: {
      model: entry.model,
      endpoint: entry.endpoint,
      promptRaw: entry.promptRaw,
      promptFlattened: entry.promptFlattened,
      response: entry.response,
    },
  }));

  log.info({ tableName: config.airtableTableName }, "Appending log batch.");
  await base(config.airtableTableName).create(records);
  log.info({ tableName: config.airtableTableName }, "Successfully appended.");
};

const init = async () => {
  if (
    !config.airtableApiKey ||
    !config.airtableBaseId ||
    !config.airtableTableName
  ) {
    throw new Error(
      "Missing required Airtable config. Refer to documentation for setup instructions."
    );
  }

  log.info("Initializing Airtable backend.");
};

export const airtable: PromptLogBackend = { init, appendBatch };
