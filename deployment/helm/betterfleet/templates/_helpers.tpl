{{/*
==============================================================================
Naming helpers
------------------------------------------------------------------------------
The base helpers ("name", "fullname", "chart") take the ROOT context (".").
The component-aware helpers take a dict: (dict "root" $ "component" "backend").
==============================================================================
*/}}

{{/* Chart name, optionally overridden. */}}
{{- define "betterfleet.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified app name. Truncated at 63 chars for DNS/label safety, leaving
headroom for per-component suffixes (e.g. "-postgres-app").
*/}}
{{- define "betterfleet.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart label value "name-version". */}}
{{- define "betterfleet.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Per-component resource name, e.g. "<fullname>-backend".
Usage: {{ include "betterfleet.componentName" (dict "root" $ "component" "backend") }}
*/}}
{{- define "betterfleet.componentName" -}}
{{- printf "%s-%s" (include "betterfleet.fullname" .root) .component | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
==============================================================================
Label helpers
==============================================================================
*/}}

{{/*
Common labels for a component.
Usage: {{ include "betterfleet.labels" (dict "root" $ "component" "backend") }}
*/}}
{{- define "betterfleet.labels" -}}
helm.sh/chart: {{ include "betterfleet.chart" .root }}
{{ include "betterfleet.selectorLabels" . }}
{{- if .root.Chart.AppVersion }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
app.kubernetes.io/part-of: betterfleet
{{- end -}}

{{/*
Selector labels for a component (immutable subset used in matchLabels).
Usage: {{ include "betterfleet.selectorLabels" (dict "root" $ "component" "backend") }}
*/}}
{{- define "betterfleet.selectorLabels" -}}
app.kubernetes.io/name: {{ include "betterfleet.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
==============================================================================
Service account
==============================================================================
*/}}
{{- define "betterfleet.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "betterfleet.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
==============================================================================
Secret helpers
==============================================================================
*/}}

{{/* Name of the Secret holding all credentials (existing or chart-managed). */}}
{{- define "betterfleet.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "betterfleet.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
==============================================================================
Image helper
Usage: {{ include "betterfleet.image" (dict "root" $ "image" .Values.backend.image) }}
Honours an optional global.imageRegistry prefix.
==============================================================================
*/}}
{{- define "betterfleet.image" -}}
{{- $registry := "" -}}
{{- if .root.Values.global -}}
{{- $registry = .root.Values.global.imageRegistry | default "" -}}
{{- end -}}
{{- $repo := .image.repository -}}
{{- $tag := .image.tag | default .root.Chart.AppVersion -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repo $tag -}}
{{- else -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
{{- end -}}

{{/*
==============================================================================
Cross-service hostnames
------------------------------------------------------------------------------
These resolve the in-cluster Service names other workloads target, and the
public (ingress-facing) URLs the browser and OIDC issuer must use.
==============================================================================
*/}}

{{/* In-cluster hostname of the application (BetterFleet) database. */}}
{{- define "betterfleet.appDbHost" -}}
{{- if .Values.backend.database.host -}}
{{- .Values.backend.database.host -}}
{{- else -}}
{{- include "betterfleet.componentName" (dict "root" . "component" "postgres-app") -}}
{{- end -}}
{{- end -}}

{{/* In-cluster hostname of the Keycloak (auth) database. */}}
{{- define "betterfleet.authDbHost" -}}
{{- if .Values.keycloak.database.host -}}
{{- .Values.keycloak.database.host -}}
{{- else -}}
{{- include "betterfleet.componentName" (dict "root" . "component" "postgres-auth") -}}
{{- end -}}
{{- end -}}

{{/* Scheme (http/https) used to build public URLs when they are not set explicitly. */}}
{{- define "betterfleet.publicScheme" -}}
{{- if .Values.ingress.tls.enabled -}}https{{- else -}}http{{- end -}}
{{- end -}}

{{/*
Public URL of the backend API (browser -> ingress "/api").
Mirrors PUBLIC_QUARKUS_HOSTNAME from docker-compose.
Explicit publicUrls.backend wins; otherwise derived from the ingress host.
*/}}
{{- define "betterfleet.backendPublicUrl" -}}
{{- if .Values.publicUrls.backend -}}
{{- .Values.publicUrls.backend -}}
{{- else -}}
{{- printf "%s://%s/api" (include "betterfleet.publicScheme" .) .Values.ingress.host -}}
{{- end -}}
{{- end -}}

{{/*
Public URL of Keycloak (browser -> ingress "/auth", and OIDC issuer base).
Mirrors PUBLIC_KEYCLOAK_HOSTNAME from docker-compose.
*/}}
{{- define "betterfleet.keycloakPublicUrl" -}}
{{- if .Values.publicUrls.keycloak -}}
{{- .Values.publicUrls.keycloak -}}
{{- else -}}
{{- printf "%s://%s/auth" (include "betterfleet.publicScheme" .) .Values.ingress.host -}}
{{- end -}}
{{- end -}}
