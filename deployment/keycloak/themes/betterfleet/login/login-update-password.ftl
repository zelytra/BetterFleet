<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=!messagesPerField.existsError('password','password-confirm'); section>
    <#if section = "header">
        ${msg("updatePasswordTitle")}
    <#elseif section = "form">
        <form id="kc-passwd-update-form" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
            <#-- hidden fields so password managers can associate the new credentials -->
            <input type="text" id="username" name="username" value="${username!''}" autocomplete="username" readonly="readonly" style="display:none;"/>
            <input type="password" id="password" name="password" autocomplete="current-password" style="display:none;"/>

            <div class="bf-form">
                <label for="password-new" class="${properties.kcLabelClass!}">
                    <span class="pf-v5-c-form__label-text">${msg("passwordNew")}</span>
                </label>

                <span class="input-wrapper ${messagesPerField.existsError('password')?then('pf-m-error', '')}">
                    <input type="password" id="password-new" name="password-new" autofocus autocomplete="new-password"
                           aria-invalid="<#if messagesPerField.existsError('password','password-confirm')>true</#if>"/>
                </span>

                <#if messagesPerField.existsError('password')>
                    <span id="input-error-password" class="input-error ${properties.kcInputErrorMessageClass!}" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('password'))?no_esc}
                    </span>
                </#if>
            </div>

            <div class="bf-form">
                <label for="password-confirm" class="${properties.kcLabelClass!}">
                    <span class="pf-v5-c-form__label-text">${msg("passwordConfirm")}</span>
                </label>

                <span class="input-wrapper ${messagesPerField.existsError('password-confirm')?then('pf-m-error', '')}">
                    <input type="password" id="password-confirm" name="password-confirm" autocomplete="new-password"
                           aria-invalid="<#if messagesPerField.existsError('password-confirm')>true</#if>"/>
                </span>

                <#if messagesPerField.existsError('password-confirm')>
                    <span id="input-error-password-confirm" class="input-error ${properties.kcInputErrorMessageClass!}" aria-live="polite">
                        ${kcSanitize(messagesPerField.get('password-confirm'))?no_esc}
                    </span>
                </#if>
            </div>

            <#if isAppInitiatedAction??>
                <div class="bf-form bf-checkbox">
                    <label for="logout-sessions">
                        <input type="checkbox" id="logout-sessions" name="logout-sessions" value="on" checked>
                        ${msg("logoutOtherSessions")}
                    </label>
                </div>
            </#if>

            <div id="kc-form-buttons" class="${properties.kcFormButtonsClass!}">
                <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" type="submit" value="${msg("doSubmit")}"/>
                <#if isAppInitiatedAction??>
                    <button class="bf-link bf-cancel" type="submit" name="cancel-aia" value="true">${msg("doCancel")}</button>
                </#if>
            </div>
        </form>
    </#if>
</@layout.registrationLayout>
