{{/*
Common labels applied to every resource.
*/}}
{{- define "forgemsg.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Values.global.image.tag | quote }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
forgemsg.com/environment: {{ .Values.global.environment }}
{{- end -}}

{{/*
Per-component selector labels.
*/}}
{{- define "forgemsg.selectorLabels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/*
Resolve the full image reference for a component.
Args: { Values, component (api|workers|voice-bot|engine|sms-gateway), tag }
*/}}
{{- define "forgemsg.image" -}}
{{- $g := .Values.global.image -}}
{{- $tag := default $g.tag "latest" -}}
{{- printf "%s/%s-%s:%s" $g.registry $g.repositoryPrefix .imageName $tag -}}
{{- end -}}

{{/*
ServiceAccount name for a component, with optional IRSA annotation prefix.
*/}}
{{- define "forgemsg.serviceAccountName" -}}
{{- printf "%s-%s" .Release.Name .component -}}
{{- end -}}
