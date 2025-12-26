
import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

// Fix: Proper initialization of Gemini API using named parameter and process.env.API_KEY
const getAIClient = () => {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return ai;
};

export const analyzeLocation = async (lat: number, lng: number): Promise<string> => {
  try {
    const client = getAIClient();
    
    // We are asking the model to act as a geographer based on coordinates
    const prompt = `
      Act as an expert geographer and GIS specialist.
      I am looking at a map location with coordinates: Latitude ${lat.toFixed(5)}, Longitude ${lng.toFixed(5)}.
      
      Please provide a concise but detailed analysis of this location. 
      Include:
      1. What likely biome or terrain is here (urban, desert, forest, agricultural, ocean, etc.).
      2. Notable nearby landmarks, cities, or geographical features if known.
      3. Potential climate or environmental characteristics.
      
      Keep the tone professional and informative. Limit response to approx 200 words.
    `;

    // Fix: Updated model to gemini-3-flash-preview for Basic Text Tasks
    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Fix: Access response.text directly as a property (not a method call)
    return response.text || "No analysis available.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw new Error("Failed to analyze location. Please check your API key.");
  }
};
