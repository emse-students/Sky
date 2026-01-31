import { SvelteKitAuth } from '@auth/sveltekit';
// @ts-expect-error - $env/dynamic/private is available at runtime
import { env as rawEnv } from '$env/dynamic/private';
import type { JWT } from '@auth/core/jwt';
import type { Session, User, Profile } from '@auth/core/types';
import { getPersonById, createPerson } from '$lib/server/database';

const env = rawEnv as Record<string, string>;

export const { handle } = SvelteKitAuth({
	providers: [
		{
			id: 'cas-emse', // signIn("my-provider") and will be part of the callback URL
			name: 'CAS EMSE', // optional, used on the default login page as the button text.
			type: 'oidc',
			issuer: 'https://cas.emse.fr/cas/oidc', // to infer the .well-known/openid-configuration URL
			clientId: env.CAS_CLIENT_ID, // from the provider's dashboard
			clientSecret: env.CAS_CLIENT_SECRET, // from the provider's dashboard
			client: {
				token_endpoint_auth_method: 'client_secret_post'
			},
			authorization: {
				scope: 'openid profile email'
			}
		}
	],
	trustHost: env.AUTH_TRUSTED_HOST === 'true',
	secret: env.AUTH_SECRET,
	callbacks: {
		async signIn({ account, profile }) {
			if (account?.provider === 'cas-emse' && profile) {
				const casId = profile.sub;
				if (!casId) return false;

				const existingPerson = getPersonById(casId);

				if (!existingPerson) {
					console.log(`[auth] Creating new Star (Person) for ${casId}`);

					// Try to extract name parts if available, or fallback to sensible defaults based on CAS ID (usually name.lastname)
					let givenName = (profile.given_name as string) || 'Unknown';
					let familyName = (profile.family_name as string) || 'Unknown';
					
					if (givenName === 'Unknown' && familyName === 'Unknown' && casId.includes('.')) {
						const parts = casId.split('.');
						givenName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
						if (parts.length > 1) {
							familyName = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
						}
					}

					createPerson({
						id: casId,
						prenom: givenName,
						nom: familyName,
						bio: 'Nouvelle étoile',
						image: undefined,
						level: null
					});
				}
				return true;
			}
			return true;
		},
		jwt({ token, user, profile }: { token: JWT; user?: User; profile?: Profile }): JWT {
			if (user) {
				token.id = profile?.sub;
			}
			return token;
		},

		session({ session, token }: { session: Session; token: JWT }): Session {
			if (token && session.user) {
				session.user.id = token.id as string;
				session.user.email = token.email as string;
				session.user.name = token.name as string;
			}
			return session;
		}
	}
});
