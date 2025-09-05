import { GoogleGenAI, Modality } from "@google/genai";

// Application state
interface ImageState {
  base64: string | null;
  mimeType: string | null;
}

let personImage: ImageState = { base64: null, mimeType: null };
let clothingImage: ImageState = { base64: null, mimeType: null };
let isLoading = false;

// DOM Element References
const personUploadInput = document.getElementById('person-upload') as HTMLInputElement;
const personPreview = document.getElementById('person-preview') as HTMLImageElement;
const personPromptText = document.getElementById('person-prompt-text') as HTMLSpanElement;
const personPlaceholder = document.getElementById('person-placeholder') as HTMLDivElement;

const clothingUploadInput = document.getElementById('clothing-upload') as HTMLInputElement;
const clothingPreview = document.getElementById('clothing-preview') as HTMLImageElement;
const clothingPromptText = document.getElementById('clothing-prompt-text') as HTMLSpanElement;
const clothingPlaceholder = document.getElementById('clothing-placeholder') as HTMLDivElement;

const tryOnButton = document.getElementById('try-on-button') as HTMLButtonElement;
const downloadButton = document.getElementById('download-button') as HTMLButtonElement;
const resultImage = document.getElementById('result-image') as HTMLImageElement;
const resultPromptText = document.getElementById('result-prompt-text') as HTMLSpanElement;
const loader = document.getElementById('loader') as HTMLDivElement;

/**
 * Converts a File object to a base64 encoded string.
 * @param file The file to convert.
 * @returns A promise that resolves with the base64 string and mime type.
 */
const fileToBase64 = (file: File): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
      resolve({ base64: data, mimeType });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

/**
 * Processes a single file (from input or drag-and-drop).
 * @param file The file to process.
 * @param type The type of image being uploaded ('person' or 'clothing').
 */
const processImageFile = async (file: File, type: 'person' | 'clothing') => {
  if (!file || !file.type.startsWith('image/')) {
    alert('Please upload a valid image file.');
    return;
  }
  
  try {
    const { base64, mimeType } = await fileToBase64(file);
    const previewElement = type === 'person' ? personPreview : clothingPreview;
    const promptTextElement = type === 'person' ? personPromptText : clothingPromptText;

    if (type === 'person') {
      personImage = { base64, mimeType };
    } else {
      clothingImage = { base64, mimeType };
    }

    previewElement.src = `data:${mimeType};base64,${base64}`;
    previewElement.classList.remove('hidden');
    previewElement.setAttribute('aria-hidden', 'false');
    promptTextElement.classList.add('hidden');
    
    updateTryOnButtonState();
  } catch (error) {
    console.error(`Error processing ${type} image:`, error);
    alert('There was an error processing your image. Please try another file.');
  }
};


/**
 * Handles image selection from the file input.
 * @param event The file input change event.
 * @param type The type of image being uploaded ('person' or 'clothing').
 */
const handleFileInputChange = (event: Event, type: 'person' | 'clothing') => {
  const input = event.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  processImageFile(file, type);
};

/**
 * Sets up drag-and-drop and click functionality for an image placeholder.
 * @param placeholder The placeholder element.
 * @param inputElement The corresponding file input element.
 * @param type The type of image ('person' or 'clothing').
 */
const setupUploadArea = (placeholder: HTMLDivElement, inputElement: HTMLInputElement, type: 'person' | 'clothing') => {
  // Make the placeholder clickable to trigger the file input
  placeholder.addEventListener('click', () => {
    inputElement.click();
  });

  placeholder.addEventListener('dragover', (event) => {
    event.preventDefault();
    placeholder.classList.add('drag-over');
  });

  placeholder.addEventListener('dragleave', () => {
    placeholder.classList.remove('drag-over');
  });

  placeholder.addEventListener('drop', (event) => {
    event.preventDefault();
    placeholder.classList.remove('drag-over');
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      const file = event.dataTransfer.files[0];
      processImageFile(file, type);
      // Reset file input value in case the same file is dropped then selected via input
      inputElement.value = '';
    }
  });
};

/**
 * Enables or disables the "Try On" button based on whether both images are uploaded.
 */
const updateTryOnButtonState = () => {
  const enabled = !!(personImage.base64 && clothingImage.base64);
  tryOnButton.disabled = !enabled;
};

/**
 * Manages the loading state of the UI.
 * @param loading Whether the application is in a loading state.
 */
const setLoadingState = (loading: boolean) => {
  isLoading = loading;
  if (loading) {
    loader.classList.remove('hidden');
    resultImage.classList.add('hidden');
    resultImage.setAttribute('aria-hidden', 'true');
    resultPromptText.classList.add('hidden');
    tryOnButton.disabled = true;
    tryOnButton.textContent = 'Generating...';
    downloadButton.disabled = true;
  } else {
    loader.classList.add('hidden');
    tryOnButton.textContent = 'Try On';
    updateTryOnButtonState();
  }
};

/**
 * Handles the main "Try On" action, calling the Gemini API.
 */
const handleTryOn = async () => {
  if (!personImage.base64 || !personImage.mimeType || !clothingImage.base64 || !clothingImage.mimeType) {
    alert('Please upload both a person and a clothing image.');
    return;
  }

  setLoadingState(true);

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const personImagePart = {
      inlineData: { data: personImage.base64, mimeType: personImage.mimeType },
    };
    const clothingImagePart = {
      inlineData: { data: clothingImage.base64, mimeType: clothingImage.mimeType },
    };
    const textPart = {
      text: "You are a virtual try-on assistant. Using the first image (the person) as the base, replace the clothing they are wearing with the clothing item from the second image. It is crucial to preserve the person's original facial features, hair, body shape, and pose exactly as they are in the first image. The final output should be a single, photorealistic image of the person wearing the new clothing.",
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: { parts: [personImagePart, clothingImagePart, textPart] },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePart?.inlineData) {
      const { data, mimeType } = imagePart.inlineData;
      resultImage.src = `data:${mimeType};base64,${data}`;
      resultImage.classList.remove('hidden');
      resultImage.setAttribute('aria-hidden', 'false');
      resultPromptText.classList.add('hidden');
      downloadButton.disabled = false; // Enable download on success
    } else {
      throw new Error("The model did not return an image. Please try again with different images.");
    }
  } catch (error) {
    console.error("Error during virtual try-on:", error);
    resultPromptText.textContent = `Error: ${error instanceof Error ? error.message : 'An unknown error occurred.'}`;
    resultPromptText.classList.remove('hidden');
    downloadButton.disabled = true; // Ensure it's disabled on error
  } finally {
    setLoadingState(false);
  }
};

/**
 * Handles the download of the generated image.
 */
const handleDownload = () => {
    if (!resultImage.src || resultImage.classList.contains('hidden')) {
        console.error("No result image available to download.");
        return;
    }

    const link = document.createElement('a');
    link.href = resultImage.src;
    
    // Create a filename from mime type
    const mimeType = resultImage.src.match(/data:(.*);base64,/)?.[1] || 'image/png';
    const extension = mimeType.split('/')[1] || 'png';
    link.download = `virtual-try-on-${Date.now()}.${extension}`;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Event Listeners
personUploadInput.addEventListener('change', (e) => handleFileInputChange(e, 'person'));
clothingUploadInput.addEventListener('change', (e) => handleFileInputChange(e, 'clothing'));
tryOnButton.addEventListener('click', handleTryOn);
downloadButton.addEventListener('click', handleDownload);

// Setup Upload Areas
setupUploadArea(personPlaceholder, personUploadInput, 'person');
setupUploadArea(clothingPlaceholder, clothingUploadInput, 'clothing');