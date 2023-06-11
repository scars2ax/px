import { config } from "../../config";
import { PromptLogBackend } from "..";
import { AirtableBackend } from "./airtable";
import { sheets } from "./sheets";

export const createPromptLogBackend = (
  backend: NonNullable<typeof config.promptLoggingBackend>
): PromptLogBackend => {
  switch (backend) {
    case "google_sheets":
      // Sheets backend is just a module, though it has a bunch of state so it
      // should probably be a class just like the Airtable backend.
      return sheets;
    case "airtable":
      return new AirtableBackend();
    default:
      throw new Error(`Unknown log backend: ${backend}`);
  }
};
