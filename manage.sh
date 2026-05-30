#!/bin/bash
SERVICES="voice-outreach-backend voice-outreach-frontend nginx"

case "$1" in
  status)
    echo "=== Voice Outreach Services ==="
    for svc in $SERVICES; do
      short=$(echo $svc | sed 's/voice-outreach-//')
      status=$(systemctl is-active $svc 2>/dev/null)
      if [ "$status" = "active" ]; then
        echo "  ✅ $short: $status"
      elif [ "$status" = "activating" ]; then
        echo "  🔄 $short: $status"
      else
        echo "  ❌ $short: $status"
      fi
    done
    echo ""
    echo "=== Data ==="
    sudo -u postgres psql voice_outreach -t -c "SELECT '  Emails: ' || count(*) FROM emails; SELECT '  Calls:  ' || count(*) FROM calls; SELECT '  Trans:  ' || count(*) FROM transcripts;" 2>/dev/null
    echo ""
    echo "=== Permanent URL ==="
    echo "  https://ava-commercial.com"
    echo ""
    echo "=== SSL Certificate ==="
    certbot certificates 2>/dev/null | grep -A2 "ava-commercial" | head -3
    ;;
  start)
    systemctl start $SERVICES
    echo "All services starting"
    sleep 5
    $0 status
    ;;
  stop)
    systemctl stop $SERVICES
    echo "All services stopped"
    ;;
  restart)
    systemctl restart $SERVICES
    echo "All services restarting"
    sleep 5
    $0 status
    ;;
  logs)
    journalctl -f -u voice-outreach-backend -u voice-outreach-frontend -u nginx
    ;;
  url)
    echo "https://ava-commercial.com"
    ;;
  db)
    sudo -u postgres psql voice_outreach
    ;;
  ssl)
    echo "=== SSL Certificate Status ==="
    certbot certificates
    echo ""
    echo "=== Auto-renewal test ==="
    certbot renew --dry-run
    ;;
  *)
    echo "Usage: $0 {status|start|stop|restart|logs|url|db|ssl}"
    ;;
esac
