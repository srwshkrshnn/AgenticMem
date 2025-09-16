import numpy as np
from openai import AzureOpenAI
from django.conf import settings

class AzureOpenAIManager:
    def __init__(self):
        self.client = AzureOpenAI(
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_key=settings.AZURE_OPENAI_KEY,
            api_version=settings.AZURE_OPENAI_VERSION
        )
        self.deployment_name = settings.AZURE_OPENAI_DEPLOYMENT
        self.embedding_deployment = settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT

    def generate_completion(self, prompt, max_tokens=1000, temperature=0.7):
        """
        Generate a completion using Azure OpenAI
        
        Args:
            prompt (str): The input prompt
            max_tokens (int): Maximum number of tokens to generate
            temperature (float): Controls randomness (0-1)
        
        Returns:
            str: The generated text
        """
        try:
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=max_tokens,
                temperature=temperature
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Error generating completion: {str(e)}")
            return None

    def analyze_text(self, text):
        """
        Analyze text using Azure OpenAI
        
        Args:
            text (str): The text to analyze
        
        Returns:
            dict: Analysis results
        """
        prompt = f"Analyze the following text and provide key themes, sentiment, and main points:\n\n{text}"
        try:
            response = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=[
                    {"role": "system", "content": "You are a text analysis expert."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.3
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"Error analyzing text: {str(e)}")
            return None

    def generate_embeddings(self, text):
        """
        Generate embeddings for the given text using Azure OpenAI
        
        Args:
            text (str): The text to generate embeddings for
        
        Returns:
            list: The embedding vector
        """
        try:
            response = self.client.embeddings.create(
                model=self.embedding_deployment,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embeddings: {str(e)}")
            return None

    def calculate_similarity(self, embedding1, embedding2):
        """
        Calculate cosine similarity between two embeddings
        
        Args:
            embedding1 (list): First embedding vector
            embedding2 (list): Second embedding vector
        
        Returns:
            float: Cosine similarity score (0-1)
        """
        if not embedding1 or not embedding2:
            return 0.0
            
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        return dot_product / (norm1 * norm2)

# Create a singleton instance
azure_openai = AzureOpenAIManager()