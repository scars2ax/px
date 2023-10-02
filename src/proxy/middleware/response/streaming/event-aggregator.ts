import { OpenAiChatCompletionStreamEvent } from "./index";

export class EventAggregator {
  private events: OpenAiChatCompletionStreamEvent[];

  constructor() {
    this.events = [];
  }

  addEvent(event: OpenAiChatCompletionStreamEvent) {
    this.events.push(event);
  }

  getCompiledEvents(req) {
    return convertEventsToFinalResponse(this.events, req);
  }
}