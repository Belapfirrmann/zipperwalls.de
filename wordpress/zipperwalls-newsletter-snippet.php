<?php
/**
 * Zipperwalls Newsletter-Schnittstelle (Code Snippets, Bereich: global)
 *
 * Damit die Claude-Routine "Newsletter Versand" freigegebene Newsletter aus dem Dashboard
 * selbst in MailPoet anlegen und einplanen kann. Nutzt intern dieselben MailPoet-Funktionen
 * wie die Knöpfe "Speichern", "Testmail senden" und "Einplanen" im MailPoet-Backend (MailPoet 5.38).
 *
 * Sicherheit:
 * - Nur eigene REST-Adressen unter /wp-json/zipperwalls/v1/, nur für Administratoren (manage_options).
 * - Verändert ausschließlich Newsletter, die über diese Schnittstelle angelegt wurden (Merkmal ZWNL::<key>).
 * - Bereits laufende oder versendete Newsletter werden nie verändert.
 * - Der Render-Filter greift nur bei diesen Newslettern; alle anderen MailPoet-Mails bleiben unberührt.
 * - Jede Aktion fängt Fehler ab und antwortet mit einer Fehlermeldung statt die Seite zu stören.
 * Abschalten: in Code Snippets deaktivieren. Daten: Optionen zw_newsletter_map und zw_newsletter_html_<key>.
 */

if (!defined('ABSPATH')) {
  return;
}

if (!function_exists('zw_nl_container')) {

  function zw_nl_container() {
    if (!class_exists('\MailPoet\DI\ContainerWrapper')) {
      throw new \RuntimeException('MailPoet ist nicht aktiv.');
    }
    return \MailPoet\DI\ContainerWrapper::getInstance();
  }

  function zw_nl_key($key) {
    $key = strtolower((string)$key);
    if (!preg_match('/^[a-z0-9-]{1,40}$/', $key)) {
      throw new \InvalidArgumentException('Ungültiger key (erlaubt: a-z, 0-9, Bindestrich).');
    }
    return $key;
  }

  function zw_nl_map() {
    $map = get_option('zw_newsletter_map', []);
    return is_array($map) ? $map : [];
  }

  // MailPoet-Newsletter zu einem key, nur wenn er wirklich von dieser Schnittstelle stammt
  function zw_nl_find($key) {
    $map = zw_nl_map();
    if (empty($map[$key])) {
      return null;
    }
    $repo = zw_nl_container()->get(\MailPoet\Newsletter\NewslettersRepository::class);
    $newsletter = $repo->findOneById((int)$map[$key]);
    if (!$newsletter || $newsletter->getDeletedAt() !== null) {
      return null;
    }
    if (strpos((string)$newsletter->getContent(), 'ZWNL::' . $key) === false) {
      return null;
    }
    return $newsletter;
  }

  function zw_nl_state($newsletter) {
    if (!$newsletter) {
      return null;
    }
    $queue = $newsletter->getLatestQueue();
    $task = $queue ? $queue->getTask() : null;
    $scheduledAt = $task && $task->getScheduledAt() ? $task->getScheduledAt()->format('Y-m-d H:i:s') : null;
    $sentAt = $newsletter->getSentAt() ? $newsletter->getSentAt()->format('Y-m-d H:i:s') : null;
    return [
      'id' => (int)$newsletter->getId(),
      'status' => $newsletter->getStatus(),
      'subject' => $newsletter->getSubject(),
      'scheduled_at_utc' => $scheduledAt,
      'sent_at' => $sentAt,
      'segment_ids' => array_map('intval', $newsletter->getSegmentIds()),
    ];
  }

  // MailPoet-JSON-Antwort auswerten
  function zw_nl_check_response($response, $what) {
    if (is_object($response) && isset($response->status) && (int)$response->status >= 200 && (int)$response->status < 300) {
      return isset($response->data) ? $response->data : null;
    }
    $messages = [];
    if (is_object($response) && !empty($response->errors) && is_array($response->errors)) {
      foreach ($response->errors as $error) {
        $messages[] = is_array($error) && isset($error['message']) ? $error['message'] : wp_json_encode($error);
      }
    }
    throw new \RuntimeException($what . ': ' . ($messages ? implode(' ', $messages) : 'unbekannter Fehler'));
  }

  // Newsletter anlegen oder aktualisieren. Der MailPoet-Inhalt ist nur ein Platzhalter mit Merkmal,
  // das eigentliche HTML liefert der Render-Filter unten.
  function zw_nl_save($key, $params, $options = null) {
    $subject = trim((string)($params['subject'] ?? ''));
    $html = (string)($params['html'] ?? '');
    if ($subject === '' || $html === '') {
      throw new \InvalidArgumentException('subject und html sind Pflicht.');
    }
    if (strpos($html, '[link:subscription_unsubscribe_url]') === false) {
      throw new \InvalidArgumentException('Im HTML fehlt der Abmeldelink [link:subscription_unsubscribe_url].');
    }
    $existing = zw_nl_find($key);
    if ($existing && in_array($existing->getStatus(), ['sending', 'sent'], true)) {
      throw new \RuntimeException('Dieser Newsletter wird bereits versendet oder ist versendet und wird nicht mehr verändert.');
    }
    $body = [
      'content' => [
        'type' => 'container', 'orientation' => 'vertical', 'styles' => ['block' => ['backgroundColor' => 'transparent']],
        'blocks' => [[
          'type' => 'container', 'orientation' => 'horizontal', 'styles' => ['block' => ['backgroundColor' => 'transparent']],
          'blocks' => [[
            'type' => 'container', 'orientation' => 'vertical', 'styles' => ['block' => ['backgroundColor' => 'transparent']],
            'blocks' => [[
              'type' => 'text',
              'text' => '<p>ZWNL::' . $key . ' Inhalt kommt aus dem Zipperwalls-Dashboard (Code-Snippet Newsletter-Schnittstelle). [link:subscription_unsubscribe_url]</p>',
            ]],
          ]],
        ]],
      ],
      'globalStyles' => new \stdClass(),
    ];
    $data = [
      'type' => 'standard',
      'subject' => $subject,
      'preheader' => (string)($params['preheader'] ?? ''),
      'body' => wp_json_encode($body),
    ];
    if ($existing) {
      $data['id'] = (int)$existing->getId();
    }
    if (!empty($params['segment_ids']) && is_array($params['segment_ids'])) {
      $data['segments'] = array_map(function ($id) {
        return ['id' => (int)$id];
      }, $params['segment_ids']);
    }
    if ($options !== null) {
      $data['options'] = $options;
    }
    // HTML zuerst speichern, damit jede Darstellung (auch beim Speichern) schon das richtige HTML hat
    update_option('zw_newsletter_html_' . $key, $html, false);
    $endpoint = zw_nl_container()->get(\MailPoet\API\JSON\v1\Newsletters::class);
    $saved = zw_nl_check_response($endpoint->save($data), 'Speichern');
    $id = (int)(is_array($saved) && isset($saved['id']) ? $saved['id'] : 0);
    if (!$id) {
      throw new \RuntimeException('Speichern: keine Newsletter-ID erhalten.');
    }
    $map = zw_nl_map();
    $map[$key] = $id;
    update_option('zw_newsletter_map', $map, false);
    return $id;
  }

  function zw_nl_utc($value) {
    $ts = strtotime((string)$value);
    if (!$ts) {
      throw new \InvalidArgumentException('send_at ist kein gültiger Zeitpunkt.');
    }
    return gmdate('Y-m-d H:i:s', $ts);
  }

  function zw_nl_rest($callback) {
    return function (\WP_REST_Request $request) use ($callback) {
      try {
        return rest_ensure_response(['ok' => true] + $callback($request));
      } catch (\Throwable $e) {
        return new \WP_REST_Response(['ok' => false, 'error' => $e->getMessage()], 400);
      }
    };
  }

  add_action('rest_api_init', function () {
    $admin = function () {
      return current_user_can('manage_options');
    };

    // Nur lesen: MailPoet-Version, Listen, Absender
    register_rest_route('zipperwalls/v1', '/newsletter/info', [
      'methods' => 'GET',
      'permission_callback' => $admin,
      'callback' => zw_nl_rest(function () {
        zw_nl_container();
        $lists = [];
        if (class_exists('\MailPoet\API\API')) {
          foreach (\MailPoet\API\API::MP('v1')->getLists() as $list) {
            $lists[] = ['id' => (int)$list['id'], 'name' => $list['name']];
          }
        }
        $settings = zw_nl_container()->get(\MailPoet\Settings\SettingsController::class);
        return [
          'mailpoet_version' => defined('MAILPOET_VERSION') ? MAILPOET_VERSION : null,
          'lists' => $lists,
          'sender' => $settings->get('sender'),
          'newsletters' => zw_nl_map(),
        ];
      }),
    ]);

    // Testmail an eine Adresse, ohne Liste und ohne Warteschlange
    register_rest_route('zipperwalls/v1', '/newsletter/preview', [
      'methods' => 'POST',
      'permission_callback' => $admin,
      'callback' => zw_nl_rest(function ($request) {
        $key = zw_nl_key($request->get_param('key'));
        $email = sanitize_email((string)$request->get_param('email'));
        if (!is_email($email)) {
          throw new \InvalidArgumentException('Gültige E-Mail-Adresse für die Testmail fehlt.');
        }
        $id = zw_nl_save($key, $request->get_params());
        $endpoint = zw_nl_container()->get(\MailPoet\API\JSON\v1\Newsletters::class);
        zw_nl_check_response($endpoint->sendPreview(['id' => $id, 'subscriber' => $email]), 'Testmail');
        return ['key' => $key, 'newsletter' => zw_nl_state(zw_nl_find($key))];
      }),
    ]);

    // Anlegen bzw. aktualisieren und einplanen (wie der Knopf "Einplanen" in MailPoet)
    register_rest_route('zipperwalls/v1', '/newsletter/schedule', [
      'methods' => 'POST',
      'permission_callback' => $admin,
      'callback' => zw_nl_rest(function ($request) {
        $key = zw_nl_key($request->get_param('key'));
        $params = $request->get_params();
        if (empty($params['segment_ids']) || !is_array($params['segment_ids'])) {
          throw new \InvalidArgumentException('segment_ids (Empfängerlisten) fehlen.');
        }
        $scheduledAt = zw_nl_utc($params['send_at'] ?? '');
        $id = zw_nl_save($key, $params, ['isScheduled' => '1', 'scheduledAt' => $scheduledAt]);
        $queue = zw_nl_container()->get(\MailPoet\API\JSON\v1\SendingQueue::class);
        zw_nl_check_response($queue->add(['newsletter_id' => $id]), 'Einplanen');
        return ['key' => $key, 'newsletter' => zw_nl_state(zw_nl_find($key))];
      }),
    ]);

    // Einplanung zurücknehmen, Newsletter bleibt als Entwurf
    register_rest_route('zipperwalls/v1', '/newsletter/unschedule', [
      'methods' => 'POST',
      'permission_callback' => $admin,
      'callback' => zw_nl_rest(function ($request) {
        $key = zw_nl_key($request->get_param('key'));
        $newsletter = zw_nl_find($key);
        if (!$newsletter) {
          return ['key' => $key, 'newsletter' => null];
        }
        if ($newsletter->getStatus() === 'scheduled') {
          $endpoint = zw_nl_container()->get(\MailPoet\API\JSON\v1\Newsletters::class);
          zw_nl_check_response($endpoint->save(['id' => (int)$newsletter->getId(), 'options' => ['isScheduled' => '0']]), 'Einplanung zurücknehmen');
        } elseif (in_array($newsletter->getStatus(), ['sending', 'sent'], true)) {
          throw new \RuntimeException('Dieser Newsletter wird bereits versendet oder ist versendet.');
        }
        return ['key' => $key, 'newsletter' => zw_nl_state(zw_nl_find($key))];
      }),
    ]);

    // In den MailPoet-Papierkorb (nur eigene, nicht laufende Newsletter, z. B. nach Tests)
    register_rest_route('zipperwalls/v1', '/newsletter/trash', [
      'methods' => 'POST',
      'permission_callback' => $admin,
      'callback' => zw_nl_rest(function ($request) {
        $key = zw_nl_key($request->get_param('key'));
        $newsletter = zw_nl_find($key);
        if ($newsletter) {
          if ($newsletter->getStatus() === 'sending') {
            throw new \RuntimeException('Dieser Newsletter wird gerade versendet.');
          }
          $endpoint = zw_nl_container()->get(\MailPoet\API\JSON\v1\Newsletters::class);
          zw_nl_check_response($endpoint->trash(['id' => (int)$newsletter->getId()]), 'Papierkorb');
        }
        $map = zw_nl_map();
        unset($map[$key]);
        update_option('zw_newsletter_map', $map, false);
        delete_option('zw_newsletter_html_' . $key);
        return ['key' => $key, 'trashed' => (bool)$newsletter];
      }),
    ]);

    // Nur lesen: Status eines Newsletters
    register_rest_route('zipperwalls/v1', '/newsletter/status', [
      'methods' => 'GET',
      'permission_callback' => $admin,
      'callback' => zw_nl_rest(function ($request) {
        $key = zw_nl_key($request->get_param('key'));
        return ['key' => $key, 'newsletter' => zw_nl_state(zw_nl_find($key))];
      }),
    ]);
  });

  // Fertiges HTML einsetzen, nur bei Newslettern mit Merkmal ZWNL::<key>
  add_filter('mailpoet_rendering_post_process', function ($html) {
    if (!is_string($html) || strpos($html, 'ZWNL::') === false) {
      return $html;
    }
    if (!preg_match('/ZWNL::([a-z0-9-]{1,40})/', $html, $m)) {
      return $html;
    }
    $stored = get_option('zw_newsletter_html_' . $m[1]);
    return (is_string($stored) && $stored !== '') ? $stored : $html;
  }, 99);
}
