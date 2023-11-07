import { ProxyRequestMiddleware } from ".";

interface TextBlock {
  type: 'text';
  text: string;
}

interface ImageBlock {
  type: 'image_url';
  image_url: string;
}

type ContentBlock = TextBlock | ImageBlock;


function extractImageUrls(text?: string): string[] {
  if (typeof text !== 'string') {
    return [];
  }
  const regexPattern = /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:\/~+#-]*[\w@?^=%&\/~+#-])/g;
  const matched = text.match(regexPattern);
  const imageUrls: string[] = [];
  if (matched) {
    matched.forEach((url) => {
      if (/\.(jpg|png|gif|webp)$/.test(url)) {
        imageUrls.push(url);
      }
    });
  }
  return imageUrls;
}

/** Finalize the rewritten request body. Must be the last rewriter. */
export const addImageFromPrompt: ProxyRequestMiddleware = (_proxyReq, req) => {
  if (["POST", "PUT", "PATCH"].includes(req.method ?? "") && req.body) {

    if (req.body?.model !== "gpt-4-vision-preview") {
      return;
    }
    // Remove potentially problematic fields
    delete req.body['stop'];
    delete req.body['logit_bias'];

    // Iterate over the array of messages
    for (let i = 0; i < req.body.messages.length; i++) {
      if (typeof req.body.messages[i].content === 'string') {
        // We are assuming extractImageUrls is a function that exists in the scope and is imported or written above this function
        let image_links = extractImageUrls(req.body.messages[i].content);

        // Replace string content with an array including the original text and any extracted image urls
        let newContent: ContentBlock[] = [{ type: 'text', text: req.body.messages[i].content }];

		for (let x = 0; x < image_links.length; x++) {
		  newContent.push({
			type: 'image_url',
			image_url: image_links[x],
		  } as ImageBlock); // Casting it as ImageBlock to satisfy TypeScript
		};

        // Update the content of the message with the new array containing text and image URLs
        req.body.messages[i].content = newContent as ContentBlock[];
      }
    }
  }
};