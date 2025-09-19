from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed
import jwt

from .utils import verify_token

User = get_user_model()

class AzureADAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        # Get the auth header
        auth_header = request.headers.get('Authorization')
        print("[Auth Debug] Authorization header:", auth_header[:50] + "..." if auth_header and len(auth_header) > 50 else auth_header)
        
        if not auth_header:
            print("[Auth Debug] No Authorization header found")
            return None

        # Check if it's a Bearer token
        parts = auth_header.split(' ')
        if len(parts) != 2:
            print("[Auth Debug] Invalid Authorization header format")
            raise AuthenticationFailed('Invalid Authorization header format. Expected "Bearer token"')
            
        auth_type, token = parts
        if auth_type.lower() != 'bearer':
            print("[Auth Debug] Invalid authorization type:", auth_type)
            raise AuthenticationFailed('Invalid authorization type. Expected "Bearer"')

        try:
            # Verify the token
            claims = verify_token(token)
            
            # Get user information from token claims
            email = claims.get('preferred_username')
            if not email:
                raise AuthenticationFailed('No email claim in token')

            # Get or create user
            user, _ = User.objects.get_or_create(
                username=email,
                defaults={'email': email}
            )

            return (user, claims)

        except jwt.InvalidTokenError as e:
            raise AuthenticationFailed(str(e))
        except Exception as e:
            raise AuthenticationFailed(f'Authentication failed: {str(e)}')