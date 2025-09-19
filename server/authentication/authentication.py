import jwt
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed
import requests

User = get_user_model()

class AzureADAuthentication(authentication.BaseAuthentication):
    def authenticate(self, request):
        # Get the auth header
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return None

        # Check if it's a Bearer token
        try:
            auth_type, token = auth_header.split(' ')
            if auth_type.lower() != 'bearer':
                return None
        except ValueError:
            return None

        try:
            # Get OpenID configuration from Azure AD
            tenant_id = settings.AZURE_AD_TENANT_ID
            oid_config_url = f'https://login.microsoftonline.com/{tenant_id}/v2.0/.well-known/openid-configuration'
            oid_config = requests.get(oid_config_url).json()
            
            # Get the JWT validation keys
            jwks_uri = oid_config['jwks_uri']
            jwks = requests.get(jwks_uri).json()
            
            # Validate the token
            decoded = jwt.decode(
                token,
                key=jwks,
                algorithms=['RS256'],
                audience=settings.AZURE_AD_CLIENT_ID,
                options={
                    'verify_aud': True,
                    'verify_exp': True,
                    'verify_iss': True,
                    'require': ['exp', 'iss', 'sub', 'aud']
                }
            )

            # Get user information from token claims
            email = decoded.get('preferred_username')
            if not email:
                raise AuthenticationFailed('No email claim in token')

            # Get or create user
            user, _ = User.objects.get_or_create(
                username=email,
                defaults={'email': email}
            )

            return (user, token)

        except jwt.InvalidTokenError as e:
            raise AuthenticationFailed(f'Invalid token: {str(e)}')
        except requests.exceptions.RequestException as e:
            raise AuthenticationFailed(f'Failed to validate token: {str(e)}')
        except Exception as e:
            raise AuthenticationFailed(f'Authentication failed: {str(e)}')