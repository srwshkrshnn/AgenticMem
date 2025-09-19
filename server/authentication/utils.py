import json
import jwt
import requests
import msal
from django.conf import settings
from django.core.cache import cache

def get_openid_config():
    """Get OpenID configuration from Azure AD"""
    config = cache.get('azure_ad_openid_config')
    if not config:
        response = requests.get(
            f'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
        )
        config = response.json()
        cache.set('azure_ad_openid_config', config, 3600)  # Cache for 1 hour
    return config

def get_jwks():
    """Get JSON Web Key Set from Azure AD"""
    jwks = cache.get('azure_ad_jwks')
    if not jwks:
        config = get_openid_config()
        response = requests.get(config['jwks_uri'])
        jwks = response.json()
        cache.set('azure_ad_jwks', jwks, 3600)  # Cache for 1 hour
    return jwks

def verify_token(token):
    """Verify Azure AD token and return claims"""
    try:
        # Basic token format validation
        if not token or not isinstance(token, str):
            raise jwt.InvalidTokenError(f'Invalid token format: {type(token)}')
            
        # Check if token has three segments
        segments = token.split('.')
        if len(segments) != 3:
            raise jwt.InvalidTokenError(f'Token should have 3 segments, got {len(segments)}')
            
        print("[Auth Debug] Token:", token[:50] + "..." if len(token) > 50 else token)
        print("[Auth Debug] Number of segments:", len(segments))
        
        # Get the unverified claims first to get tenant info
        unverified_claims = jwt.decode(token, options={"verify_signature": False})
        print("[Auth Debug] Unverified claims:", unverified_claims)
        
        # Get tenant ID from token claims
        tenant_id = unverified_claims.get('tid', 'common')
        
        # Get the JWKS
        jwks = get_jwks()
        print("[Auth Debug] JWKS:", jwks)
        
        # Get the key ID from the token header
        header = jwt.get_unverified_header(token)
        key_id = header.get('kid')
        if not key_id:
            raise jwt.InvalidTokenError('No key ID in token header')
            
        # Find the signing key
        key = next((k for k in jwks['keys'] if k['kid'] == key_id), None)
        if not key:
            raise jwt.InvalidTokenError(f'Signing key not found. Key ID: {key_id}')
            
        print("[Auth Debug] Found matching key:", key)
        
        # Expected issuer based on tenant
        expected_issuer = f"https://login.microsoftonline.com/{tenant_id}/v2.0"
        print("[Auth Debug] Expected issuer:", expected_issuer)
        
        # Validate claims
        claims = jwt.decode(
            token,
            jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key)),
            algorithms=['RS256'],
            issuer=expected_issuer,
            audience=settings.AZURE_AD_CLIENT_ID,
            options={
                'verify_aud': True,
                'verify_exp': True,
                'verify_iss': True
            }
        )
        
        print("[Auth Debug] Token validated successfully")
        return claims
        
    except jwt.InvalidTokenError as e:
        raise jwt.InvalidTokenError(f'Token validation failed: {str(e)}')
    except Exception as e:
        raise jwt.InvalidTokenError(f'Token processing failed: {str(e)}')