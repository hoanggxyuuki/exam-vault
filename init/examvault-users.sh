#!/usr/bin/env bash

EXAMVAULT_LINKS_FILE="${SCRIPT_DIR}/.invite-links.txt"
EXAMVAULT_USERS=(examoffice invigilator)

examvault_user_json() {
  case "$1" in
    examoffice)  echo '{"username":"examoffice","email":"examoffice@examvault.test","firstName":"Hoa","lastName":"Nguyen","enabled":true,"emailVerified":false,"attributes":{"tideInvitable":["true"]}}' ;;
    invigilator) echo '{"username":"invigilator","email":"invigilator@examvault.test","firstName":"Minh","lastName":"Pham","enabled":true,"emailVerified":false,"attributes":{"tideInvitable":["true"]}}' ;;
  esac
}

examvault_user_roles() {
  case "$1" in
    examoffice)  echo "lecturer _tide_encryptor" ;;
    invigilator) echo "invigilator" ;;
    *)           echo "" ;;
  esac
}

examvault_user_id() {
  TOKEN="$(get_admin_token)"
  api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=$1&exact=true"
  jq -r '.[0].id // empty' <<< "${RESP_BODY}"
}

examvault_create_users() {
  echo "[examvault] creating demo users..."
  local u
  for u in "${EXAMVAULT_USERS[@]}"; do
    TOKEN="$(get_admin_token)"
    api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users" \
      -H "Content-Type: application/json" -d "$(examvault_user_json "$u")"
    echo "  create ${u} -> ${RESP_CODE}"
  done
  drain_change_requests "(examvault users)"

  echo "[examvault] assigning realm roles..."
  local uid roles r
  for u in "${EXAMVAULT_USERS[@]}"; do
    roles="$(examvault_user_roles "$u")"
    [[ -z "${roles}" ]] && continue
    uid="$(examvault_user_id "$u")"
    for r in ${roles}; do
      TOKEN="$(get_admin_token)"
      api GET "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/roles/${r}"
      local rep="${RESP_BODY}"
      TOKEN="$(get_admin_token)"
      api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users/${uid}/role-mappings/realm" \
        -H "Content-Type: application/json" -d "[${rep}]"
      echo "  role ${u} ${r} -> ${RESP_CODE}"
      drain_change_requests "(${u} ${r})"
    done
  done
  drain_change_requests "(examvault roles)"

  echo "[examvault] minting Tide enrollment links -> ${EXAMVAULT_LINKS_FILE}"
  : > "${EXAMVAULT_LINKS_FILE}"
  chmod 600 "${EXAMVAULT_LINKS_FILE}"
  for u in "${EXAMVAULT_USERS[@]}"; do
    uid="$(examvault_user_id "$u")"
    TOKEN="$(get_admin_token)"
    api POST "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/tideAdminResources/get-required-action-link?userId=${uid}&lifespan=43200" \
      -H "Content-Type: application/json" -H "Accept: text/plain" -d '["link-tide-account-action"]'
    if [[ "${RESP_CODE}" != 2* ]]; then
      echo "ERROR: could not mint enrollment link for ${u} (HTTP ${RESP_CODE}): ${RESP_BODY}" >&2
      exit 1
    fi
    echo "${u} ${RESP_BODY}" >> "${EXAMVAULT_LINKS_FILE}"
  done
}

examvault_wait_enrolled() {
  echo "[examvault] waiting for examoffice and invigilator to enroll (links in ${EXAMVAULT_LINKS_FILE})..."
  local u attrs key vuid pending
  while true; do
    pending=""
    for u in "${EXAMVAULT_USERS[@]}"; do
      TOKEN="$(get_admin_token)"
      attrs=$(curl -s "${TIDECLOAK_LOCAL_URL}/admin/realms/${REALM_NAME}/users?username=${u}&exact=true&briefRepresentation=false" \
        -H "Authorization: Bearer ${TOKEN}" -H "Cache-Control: no-store")
      key=$(jq -r '.[0].attributes.tideUserKey[0] // empty' <<< "${attrs}")
      vuid=$(jq -r '.[0].attributes.vuid[0] // empty' <<< "${attrs}")
      [[ -z "${key}" || -z "${vuid}" ]] && pending+=" ${u}"
    done
    if [[ -z "${pending}" ]]; then echo "  all demo users enrolled."; return 0; fi
    printf "  still waiting for:%s\r" "${pending}"
    sleep 5
  done
}
