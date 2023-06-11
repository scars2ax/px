import Airtable from "airtable";
import axios, { AxiosError } from "axios";
import { config } from "../../config";
import { logger } from "../../logger";
import { PromptLogBackend, PromptLogEntry } from "..";

type AirbaseFieldType =
  | "singleLineText"
  | "multilineText"
  | "number"
  | "dateTime";

type IndexRecord = {
  /** Name of the base */
  id: string;
  /** Schema version of the base */
  schema: 1;
  /** Last row number used */
  lastRow: number;
  /** When the base was created. ISO 8601 format. */
  created: string;
};

const INDEX_BASE_NAME = "oai-proxy-index";

export class AirtableBackend implements PromptLogBackend {
  private log = logger.child({ module: "airtable" });
  private airtable: Airtable;
  private indexBase: Airtable.Base | null = null;
  private indexTable: Airtable.Table<IndexRecord> | null = null;
  private activeLogBase: Airtable.Base | null = null;
  private activeLogTable: Airtable.Table<PromptLogEntry> | null = null;

  constructor() {
    this.airtable = new Airtable({
      apiKey: config.airtableKey,
      requestTimeout: 1000 * 60 * 1,
    });
  }

  async init() {
    this.log.info("Initializing Airtable backend...");
    await this.ensureIndexBase();
    await this.ensureLogBase();
  }

  private async ensureIndexBase() {
    const bases = await this.listBases();
    const indexBaseId = bases.find((b) => b.name === INDEX_BASE_NAME)?.id;
    if (!indexBaseId) {
      this.log.info("Creating index base.");
      const result = await this.createBase(INDEX_BASE_NAME, [
        { name: "id", type: "singleLineText" },
        { name: "schema", type: "number" },
        { name: "lastRow", type: "number" },
        { name: "created", type: "dateTime" },
      ]);
      this.log.info("Index base created.");
      this.indexBase = this.airtable.base(result);
      this.indexTable = this.indexBase.table<IndexRecord>(INDEX_BASE_NAME);
    } else {
      this.log.info("Index base already exists.");
      this.indexBase = this.airtable.base(indexBaseId);
      this.indexTable = this.indexBase.table<IndexRecord>(INDEX_BASE_NAME);
    }
  }

  /**
   * Sets the active log base to the newest one in the index, unless there are
   * no bases or the newest one is already full. Creates a new base if needed.
   */
  private async ensureLogBase() {
    const indexRecords = await this.indexTable!.select().all();
    if (indexRecords.length === 0) {
      this.log.info("No log bases found, creating a new one.");
      await this.createLogBase();
    } else {
      const newestBase = indexRecords.reduce((a, b) => {
        const aDate = new Date(a.get("created"));
        const bDate = new Date(b.get("created"));
        return aDate > bDate ? a : b;
      });
      const lastRow = newestBase.get("lastRow");
      if (lastRow >= 1000) {
        this.log.info(
          { lastRow },
          "Last log base is full, creating a new one."
        );
        await this.createLogBase();
      } else if (this.activeLogBase === null) {
        const newestBaseId = newestBase.get("id");
        this.log.info(
          { activeLogBase: newestBaseId },
          "Setting active log base."
        );
        this.activeLogBase = this.airtable.base(newestBaseId);
        this.activeLogTable =
          this.activeLogBase.table<PromptLogEntry>(newestBaseId);
      } else {
        this.log.debug("Active log base already set.");
      }
    }
  }

  private async createLogBase() {
    const indexRecords = await this.indexTable!.select().all();
    const baseCount = indexRecords.length;
    const baseName = `oai-proxy-log-${baseCount.toString().padStart(3, "0")}`;
    this.log.info({ baseName }, "Creating new log base.");

    const newBaseId = await this.createBase(baseName, [
      { name: "model", type: "singleLineText" },
      { name: "endpoint", type: "singleLineText" },
      { name: "promptRaw", type: "multilineText" },
      { name: "prompt", type: "multilineText" },
      { name: "response", type: "multilineText" },
    ]);
    this.activeLogBase = this.airtable.base(newBaseId);
    this.activeLogTable = this.activeLogBase.table<PromptLogEntry>(baseName);
    this.log.info({ baseName }, "New log base created and activated.");
    await this.indexTable!.create([
      {
        fields: {
          id: newBaseId,
          schema: 1,
          lastRow: 0,
          created: new Date().toISOString(),
        },
      },
    ]);
    this.log.info({ baseName }, "New log base added to index.");
  }

  /**
   * Appends a batch of entries to the log and updates the index. If the log
   * has reached its maximum size, a new log base will be created.
   */
  async appendBatch(entries: PromptLogEntry[]) {
    if (!this.activeLogBase || !this.activeLogTable) {
      throw new Error("No active log base.");
    }
    // Airtable can only create 10 rows at a time, so we have to chunk it.
    const chunkSize = 10;
    const chunks = [];
    for (let i = 0; i < entries.length; i += chunkSize) {
      chunks.push(entries.slice(i, i + chunkSize));
    }
    this.log.info(
      { batchSize: entries.length, chunks: chunks.length },
      "Appending batch of log entries."
    );
    for (const chunk of chunks) {
      const records = chunk.map((entry) => ({
        fields: {
          model: entry.model,
          endpoint: entry.endpoint,
          promptRaw: entry.promptRaw,
          prompt: entry.promptFlattened,
          response: entry.response,
        },
      }));
      await this.activeLogTable.create(records);
      this.log.info(
        { count: records.length },
        "Submitted chunk of log entries."
      );
    }
    await this.syncIndex();
    await this.ensureLogBase();
  }

  async syncIndex() {
    if (!this.activeLogBase || !this.activeLogTable) {
      throw new Error("No active log base.");
    }
    const logRecords = await this.activeLogTable.select().all();
    const logCount = logRecords.length;
    // Update the index with the new row count, by the active log base ID.
    const indexRecords = await this.indexTable!.select({
      filterByFormula: `{id} = "${this.activeLogBase.getId()}"`,
    }).all();
    if (indexRecords.length !== 1) {
      throw new Error("Index record not found.");
    }
    const indexRecord = indexRecords[0];
    await this.indexTable!.update([
      { id: indexRecord.id, fields: { lastRow: logCount } },
    ]);
  }

  // The airtable library doesn't support meta operations like listing or
  // creating bases, so we have to do that ourselves.

  /**
   * Lists all bases in the workspace.
   * @returns Array of base objects with `id` and `name` properties.
   */
  private async listBases(): Promise<{ id: string; name: string }[]> {
    // Maximum page size is 1000 but I'm not going to bother with that for now.
    const url = `https://api.airtable.com/v0/meta/bases`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${config.airtableKey}` },
    });
    return response.data.bases;
  }

  /**
   * Creates a new base with the given name and table schema. Table will be
   * created with the same name as the base.
   * Schema is a list of fields, each of which has a name and type. Only a
   * subset of field types are supported.
   * Returns the id of the new base.
   */
  private async createBase(
    name: string,
    fields: { name: string; type: AirbaseFieldType }[]
  ) {
    const url = `https://api.airtable.com/v0/meta/bases`;
    const response = await axios.post(
      url,
      { name, tables: [{ name, fields }] },
      { headers: { Authorization: `Bearer ${config.airtableKey}` } }
    );
    return response.data.id;
  }
}
