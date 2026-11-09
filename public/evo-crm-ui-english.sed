# Evo CRM (crm.restart.ng) frontend: English UI string patch. Fetched by the evo_frontend container at start and applied with sed.
# Translates hardcoded Portuguese UI strings in the stock 1.0.0-rc2 build. Safe to re-run; rules that no longer match do nothing.
s#"Busque servidores MCP existentes, filtre por critérios ou adicione um novo servidor clicando em \\"Novo Servidor\\"\."#"Search existing MCP servers, filter by criteria or add a new server by clicking \\"New Server\\"."#g
s#Busque servidores MCP existentes, filtre por critérios ou adicione um novo servidor clicando em "Novo Servidor"\.#Search existing MCP servers, filter by criteria or add a new server by clicking "New Server".#g
s#"Escolha uma conversa existente na lista ao lado ou clique em \\"Nova Conversa\\" para começar\."#"Choose an existing conversation from the list or click \\"New Conversation\\" to start."#g
s#Escolha uma conversa existente na lista ao lado ou clique em "Nova Conversa" para começar\.#Choose an existing conversation from the list or click "New Conversation" to start.#g
s#"Busque tools existentes, aplique filtros ou crie uma nova tool clicando em \\"Nova Tool\\"\."#"Search existing tools, apply filters or create a new tool by clicking \\"New Tool\\"."#g
s#Busque tools existentes, aplique filtros ou crie uma nova tool clicando em "Nova Tool"\.#Search existing tools, apply filters or create a new tool by clicking "New Tool".#g
s#"QR Code não disponível\. Clique em \\"Atualizar QR Code\\" para gerar um novo\."#"QR Code not available. Click \\"Refresh QR Code\\" to generate a new one."#g
s#QR Code não disponível\. Clique em "Atualizar QR Code" para gerar um novo\.#QR Code not available. Click "Refresh QR Code" to generate a new one.#g
s#"Configuração de \\"Visto por último\\" atualizada"#"\\"Last seen\\" setting updated"#g
s#Configuração de "Visto por último" atualizada#"Last seen" setting updated#g
s#"Todas as ações agendadas aparecem aqui com status (agendada, executada, cancelada) e contagem regressiva\. Use as ações da linha para editar ou cancelar uma ação antes da execução\."#"All scheduled actions appear here with their status (scheduled, executed, canceled) and a countdown. Use the row actions to edit or cancel an action before it runs."#g
s#"Ex: Atualize o nome do contato quando ele se apresentar\. Adicione o email quando o cliente fornecer\. Atualize a cidade quando o cliente mencionar sua localização\.\.\."#"Ex: Update the contact\\'s name when they introduce themselves. Add the email when the customer provides it. Update the city when the customer mentions their location..."#g
s#"Cada card exibe nome, descrição e status da tool\. Use as ações para editar, testar ou excluir\. Ferramentas testadas garantem que o Agente as use corretamente\."#"Each card shows the tool\\'s name, description and status. Use the actions to edit, test or delete. Tested tools make sure the Agent uses them correctly."#g
s#"Aqui você visualiza e gerencia todas as ações programadas para serem executadas automaticamente em contatos — como envio de mensagens em datas específicas\."#"Here you view and manage all actions scheduled to run automatically on contacts, such as sending messages on specific dates."#g
s#"Permite que o agente edite informações do contato durante a conversa\. Configure quais campos podem ser alterados e quando isso deve acontecer\."#"Lets the agent edit contact information during the conversation. Configure which fields can be changed and when."#g
s#"Clique aqui para criar uma nova ação agendada\. Você poderá escolher o contato, definir o tipo de ação e configurar a data e hora de execução\."#"Click here to create a new scheduled action. You can choose the contact, set the action type and configure the execution date and time."#g
s#"Conecte o seu agente a outros aplicativos, isso permite que ele obtenha informações mais precisas ou agende reuniões para você\."#"Connect your agent to other apps so it can get more accurate information or schedule meetings for you."#g
s#"Pesquise ações agendadas pelo nome do contato, tipo de ação ou qualquer outro campo para encontrar rapidamente o que precisa\."#"Search scheduled actions by contact name, action type or any other field to quickly find what you need."#g
s#"Cada servidor exibe nome, URL de conexão e status\. Use as ações para editar, testar a conexão ou excluir o servidor\."#"Each server shows its name, connection URL and status. Use the actions to edit, test the connection or delete the server."#g
s#"Defina quando o agente deve criar tarefas, adicionar serviços, ou realizar outras ações neste pipeline\.\.\."#"Define when the agent should create tasks, add services, or perform other actions in this pipeline..."#g
s#"Configure instruções para o agente manipular pipelines e atribuir conversas a estágios específicos\."#"Configure instructions for the agent to handle pipelines and assign conversations to specific stages."#g
s#"Conecte sua conta Atlassian para permitir que o agente acesse Jira, Confluence e outras ferramentas"#"Connect your Atlassian account to let the agent access Jira, Confluence and other tools"#g
s#"Nome do agente não pode conter espaços ou caracteres especiais\. Use apenas letras, números, _ ou -"#"Agent name cannot contain spaces or special characters. Use only letters, numbers, _ or -"#g
s#"O agente agora pode acessar repositórios, issues, pull requests e outras informações do GitHub\."#"The agent can now access repositories, issues, pull requests and other GitHub information."#g
s#"Os agendamentos são distribuídos entre as agendas alternando entre elas de maneira sequencial\."#"Bookings are distributed across calendars, alternating between them sequentially."#g
s#"O agente agora pode acessar informações de pagamentos, assinaturas e transações do PayPal\."#"The agent can now access PayPal payment, subscription and transaction information."#g
s#"Seleciona automaticamente a agenda mais apropriada de acordo com a conversa com o cliente\."#"Automatically selects the most appropriate calendar based on the conversation with the customer."#g
s#"Conecte sua conta Monday\.com para permitir que o agente acesse boards, itens e automações"#"Connect your Monday.com account to let the agent access boards, items and automations"#g
s#"Permita que o agente acesse informações de pagamentos, assinaturas e transações do PayPal"#"Allow the agent to access PayPal payment, subscription and transaction information"#g
s#"O agente agora pode acessar informações de pagamentos, assinaturas e transações do Canva\."#"The agent can now access Canva payment, subscription and transaction information."#g
s#"Permite que o agente mova conversas entre pipelines e estágios conforme regras definidas"#"Lets the agent move conversations between pipelines and stages according to defined rules"#g
s#"Permite que o agente envie mensagens como resposta a uma mensagem específica na conversa"#"Lets the agent send messages as a reply to a specific message in the conversation"#g
s#"Conecte sua conta Asana\.com para permitir que o agente acesse boards, itens e automações"#"Connect your Asana.com account to let the agent access boards, items and automations"#g
s#"Permita que o agente acesse informações de pagamentos, assinaturas e transações do Canva"#"Allow the agent to access Canva payment, subscription and transaction information"#g
s#"Permita que o agente acesse pagamentos, assinaturas e informações de clientes do Stripe"#"Allow the agent to access Stripe payments, subscriptions and customer information"#g
s#"Conecte sua conta Linear para permitir que o agente acesse issues, projetos e roadmaps"#"Connect your Linear account to let the agent access issues, projects and roadmaps"#g
s#"Permite que o agente use emojis nas respostas para tornar a comunicação mais amigável"#"Lets the agent use emojis in replies to make communication friendlier"#g
s#"Permite que o agente transfira a conversa para um atendente humano quando necessário"#"Lets the agent transfer the conversation to a human agent when needed"#g
s#"O agente agora pode acessar páginas, bancos de dados e outras informações do Notion\."#"The agent can now access pages, databases and other Notion information."#g
s#"O agente agora pode acessar pagamentos, assinaturas e outras informações do Stripe\."#"The agent can now access payments, subscriptions and other Stripe information."#g
s#"Health check falhou\. Verifique se a URL da Evolution API está correta e acessível\."#"Health check failed. Check that the Evolution API URL is correct and reachable."#g
s#"Configure quando e como o agente deve mover conversas entre pipelines e estágios\."#"Configure when and how the agent should move conversations between pipelines and stages."#g
s#"Configure quando e como o agente deve transferir conversas para humanos ou times\."#"Configure when and how the agent should transfer conversations to humans or teams."#g
s#"O agente agora pode acessar e gerenciar seus projetos e bancos de dados Supabase\."#"The agent can now access and manage your Supabase projects and databases."#g
s#"Health check falhou\. Verifique se a URL da Evolution Go está correta e acessível\."#"Health check failed. Check that the Evolution Go URL is correct and reachable."#g
s#"IA ainda não está ativa neste período, ou as respostas não foram classificadas\."#"AI is not active in this period yet, or responses were not classified."#g
s#"O estado de publicação controla a disponibilidade do agente para acesso externo"#"The publication state controls the agent\\'s availability for external access"#g
s#"Configure ações que o agente deve executar quando o cliente parar de responder\."#"Configure actions the agent should run when the customer stops responding."#g
s#"O agente agora pode acessar contatos, empresas e outras informações do HubSpot\."#"The agent can now access contacts, companies and other HubSpot information."#g
s#"Permita que o agente acesse e gerencie seus projetos e bancos de dados Supabase"#"Allow the agent to access and manage your Supabase projects and databases"#g
s#"Por favor, selecione uma conversa ou crie uma nova antes de enviar uma mensagem"#"Please select a conversation or create a new one before sending a message"#g
s#"Permita que o agente acesse contatos, empresas e outras informações do HubSpot"#"Allow the agent to access contacts, companies and other HubSpot information"#g
s#"Ex\. Seja extrovertido, na primeira interação procure saber o nome do usuário\."#"Ex. Be outgoing; in the first interaction try to find out the user\\'s name."#g
s#"Quando o cliente mencionar interesse em produto X, mova para este estágio\.\.\."#"When the customer mentions interest in product X, move to this stage..."#g
s#"Permite agendar eventos, verificar disponibilidade e gerenciar calendários\."#"Lets you schedule events, check availability and manage calendars."#g
s#"Ative para coletar informações dos visitantes antes de iniciar a conversa\."#"Enable to collect visitor information before starting the conversation."#g
s#"Alterne entre visualização em cards e em tabela conforme sua preferência\."#"Switch between card view and table view as you prefer."#g
s#"O agente agora pode acessar boards, itens e outras informações do Monday\."#"The agent can now access boards, items and other Monday information."#g
s#"Ainda sem avaliações suficientes para uma leitura estatística confiável\."#"Not enough ratings yet for a reliable statistical reading."#g
s#"O agente agora pode acessar boards, itens e outras informações do Asana\."#"The agent can now access boards, items and other Asana information."#g
s#"Este template foi criado com HTML\. Você pode editá-lo visualmente agora\."#"This template was created with HTML. You can now edit it visually."#g
s#"Configure instruções para o agente fazer transferência do atendimento\."#"Configure instructions for the agent to transfer the support session."#g
s#"Conecte o agente a serviços externos através do Model Context Protocol"#"Connect the agent to external services through the Model Context Protocol"#g
s#"Define o fuso horário usado pelo agente para agendamentos e lembretes"#"Sets the time zone the agent uses for scheduling and reminders"#g
s#"Integração com repositórios, issues, pull requests e ações do GitHub\."#"Integration with GitHub repositories, issues, pull requests and actions."#g
s#"Gerencie pagamentos, assinaturas e informações de clientes no Stripe\."#"Manage payments, subscriptions and customer information in Stripe."#g
s#"Olá! Para melhor atendê-lo, por favor preencha as informações abaixo:"#"Hi! To serve you better, please fill in the information below:"#g
s#"Permite que o agente edite informações de contato durante a conversa"#"Lets the agent edit contact information during the conversation"#g
s#"Gerencie pagamentos, transações e informações de clientes no PayPal\."#"Manage payments, transactions and customer information in PayPal."#g
s#"Defina quando e como o agente deve editar as informações do contato"#"Define when and how the agent should edit contact information"#g
s#"Crie e edite designs, apresentações e materiais visuais com Canva\."#"Create and edit designs, presentations and visual materials with Canva."#g
s#"Defina em quais momentos o agente vai mandar em áudio a resposta\."#"Define when the agent will send the reply as audio."#g
s#"Permite que o agente registre lembretes e tarefas para o usuário"#"Lets the agent record reminders and tasks for the user"#g
s#"Descreva como o agente deve se comportar durante a conversa\.\.\."#"Describe how the agent should behave during the conversation..."#g
s#"Domínios ou IPs permitidos para acessar o agente externamente"#"Domains or IPs allowed to access the agent externally"#g
s#"Configure como as mensagens longas serão divididas e enviadas"#"Configure how long messages are split and sent"#g
s#"Configurações do formulário pré-chat atualizadas com sucesso!"#"Pre-chat form settings updated successfully!"#g
s#"Colete informações dos visitantes antes de iniciar a conversa"#"Collect visitor information before starting the conversation"#g
s#"Website URL deve ser uma URL válida (ex: https:\/\/meusite\.com)"#"Website URL must be a valid URL (e.g. https://mysite.com)"#g
s#"• O formulário é exibido antes do cliente iniciar a conversa"#"• The form is shown before the customer starts the conversation"#g
s#"Não foi possível carregar o conteúdo\. Editor iniciado vazio\."#"Could not load the content. Editor started empty."#g
s#"Refine os indicadores por pipeline, equipe, canal e período"#"Refine the indicators by pipeline, team, channel and period"#g
s#"Onde estão os gargalos e oportunidades de ganho na operação"#"Where the bottlenecks and gains are in the operation"#g
s#"Indicadores-chave para leitura rápida da saúde operacional"#"Key indicators for a quick read of operational health"#g
s#"Sincronize contatos, deals e atividades com o HubSpot CRM\."#"Sync contacts, deals and activities with HubSpot CRM."#g
s#"Esta mensagem será exibida no topo do formulário pré-chat\."#"This message will be shown at the top of the pre-chat form."#g
s#"• Campos obrigatórios devem ser preenchidos para continuar"#"• Required fields must be filled in to continue"#g
s#"Atributos personalizados para pipelines, estágios e items"#"Custom attributes for pipelines, stages and items"#g
s#"• Informações coletadas são anexadas ao perfil do contato"#"• Collected information is attached to the contact profile"#g
s#"Seja específico sobre quando cada campo deve ser editado"#"Be specific about when each field should be edited"#g
s#"URL HTTPS para receber notificações de eventos do agente"#"HTTPS URL to receive agent event notifications"#g
s#"Tempo que o agente aguarda antes de processar mensagens"#"Time the agent waits before processing messages"#g
s#"Agora você receberá mensagens em tempo real novamente\."#"You will now receive messages in real time again."#g
s#"Configure como as mensagens são processadas e enviadas"#"Configure how messages are processed and sent"#g
s#"Você não tem permissão para visualizar ações agendadas"#"You do not have permission to view scheduled actions"#g
s#"Erro ao atualizar configurações do formulário pré-chat"#"Failed to update pre-chat form settings"#g
s#"Configure as configurações de privacidade do WhatsApp"#"Configure WhatsApp privacy settings"#g
s#"Habilita o agente a modificar informações de contato"#"Enables the agent to modify contact information"#g
s#"Tempo de espera entre caracteres ao enviar mensagens"#"Wait time between characters when sending messages"#g
s#"Sem dados de atendentes para o período selecionado\."#"No agent data for the selected period."#g
s#"Digite sua mensagem abaixo para começar a conversa\."#"Type your message below to start the conversation."#g
s#"Volume e participação dos agentes IA nas respostas"#"Volume and share of AI agents in responses"#g
s#"Quando o cliente quiser falar sobre tal assunto\.\.\."#"When the customer wants to talk about a given subject..."#g
s#"Gerencie boards, itens e automações no Monday\.com\."#"Manage boards, items and automations in Monday.com."#g
s#"Atributos aplicados a pipelines, estágios ou items"#"Attributes applied to pipelines, stages or items"#g
s#"Configuração de confirmações de leitura atualizada"#"Read receipts setting updated"#g
s#"Adia a conversa até uma data específica (em horas)"#"Snoozes the conversation until a specific time (in hours)"#g
s#"Evolução da operação ao longo do período filtrado"#"Operation trend over the filtered period"#g
s#"Silencia a conversa para não receber notificações"#"Mutes the conversation so you do not receive notifications"#g
s#"Alterne entre visualização em cards e em tabela\."#"Switch between card view and table view."#g
s#"Configure o modelo de linguagem e a chave de API"#"Configure the language model and API key"#g
s#"Configure como o agente interage com os usuários"#"Configure how the agent interacts with users"#g
s#"• Use a função arrastar para reordenar os campos"#"• Use drag and drop to reorder the fields"#g
s#"Configuração de rejeição de chamadas atualizada!"#"Call rejection setting updated!"#g
s#"Configure a tarefa que este agente irá executar"#"Configure the task this agent will perform"#g
s#"Você não tem permissão para visualizar contatos"#"You do not have permission to view contacts"#g
s#"Configuração de visualização de foto atualizada"#"Photo visibility setting updated"#g
s#"Distribuição percentual de conversas por canal"#"Percentage distribution of conversations by channel"#g
s#"Configure as informações básicas do seu agente"#"Configure your agent\\'s basic information"#g
s#"Solicitar e-mail para enviar convite na agenda"#"Ask for email to send the calendar invite"#g
s#"Código de autorização ou state não encontrado"#"Authorization code or state not found"#g
s#"Configure a integração com o provider externo"#"Configure the integration with the external provider"#g
s#"Perguntar se o cliente ainda está interessado"#"Ask whether the customer is still interested"#g
s#"Selecione um pipeline para adicionar estágios"#"Select a pipeline to add stages"#g
s#"Configuração de permissão de grupo atualizada"#"Group permission setting updated"#g
s#"API Key SID é obrigatório quando usar API Key"#"API Key SID is required when using API Key"#g
s#"Não foi possível iniciar o OAuth da Microsoft"#"Could not start Microsoft OAuth"#g
s#"Envia a transcrição da conversa para um email"#"Sends the conversation transcript to an email"#g
s#"Usando cache antigo de permissões do usuário"#"Using stale user permissions cache"#g
s#"Usando cache antigo de permissões do account"#"Using stale account permissions cache"#g
s#"Volume de conversas por dia da semana e hora"#"Conversation volume by weekday and hour"#g
s#"Recursos avançados de memória e planejamento"#"Advanced memory and planning features"#g
s#"Número máximo de caracteres em cada segmento"#"Maximum number of characters in each segment"#g
s#"Erro ao carregar mensagens\. Tente novamente\."#"Failed to load messages. Please try again."#g
s#"Selecione pelo menos 2 contatos para mesclar"#"Select at least 2 contacts to merge"#g
s#"Você não tem permissão para mesclar contatos"#"You do not have permission to merge contacts"#g
s#"Integração direta com assistentes da OpenAI"#"Direct integration with OpenAI assistants"#g
s#"O papel que o agente desempenha na conversa"#"The role the agent plays in the conversation"#g
s#"Gerencie os serviços associados a este item"#"Manage the services associated with this item"#g
s#"Descrição do perfil atualizada com sucesso!"#"Profile description updated successfully!"#g
s#"Redirecionando para autenticação Outlook\.\.\."#"Redirecting to Outlook authentication..."#g
s#"Dispara um webhook para um endpoint externo"#"Triggers a webhook to an external endpoint"#g
s#"Anexar um resumo da conversa no agendamento"#"Attach a conversation summary to the booking"#g
s#"Erro ao processar autorização do Microsoft"#"Failed to process Microsoft authorization"#g
s#"Tamanho mínimo para criar um novo segmento"#"Minimum size to create a new segment"#g
s#"Agente pode consultar horários disponíveis"#"Agent can check available times"#g
s#"Escolha qual planilha o agente terá acesso"#"Choose which spreadsheet the agent will have access to"#g
s#"Agente pode criar novas linhas na planilha"#"Agent can create new rows in the spreadsheet"#g
s#"Você não tem permissão para criar contatos"#"You do not have permission to create contacts"#g
s#"Não foi possível iniciar o OAuth do Google"#"Could not start Google OAuth"#g
s#"Atribui a conversa a uma equipe específica"#"Assigns the conversation to a specific team"#g
s#"Instruções gerais (quando e o que fazer):"#"General instructions (when and what to do):"#g
s#"Enviar mensagem como resposta na conversa"#"Send message as a reply in the conversation"#g
s#"Google Calendar desconectado com sucesso!"#"Google Calendar disconnected successfully!"#g
s#"Agente pode atualizar células da planilha"#"Agent can update spreadsheet cells"#g
s#"Redirecionando para autenticação Gmail\.\.\."#"Redirecting to Gmail authentication..."#g
s#"Envia uma mensagem automática na conversa"#"Sends an automatic message in the conversation"#g
s#"Atribui a conversa a um agente específico"#"Assigns the conversation to a specific agent"#g
s#"Remove a atribuição de equipe da conversa"#"Removes the team assignment from the conversation"#g
s#"Ex: Ajudar usuários com dúvidas técnicas"#"Ex: Help users with technical questions"#g
s#"Erro ao carregar ferramentas disponíveis"#"Failed to load available tools"#g
s#"Não permita agendamentos em cima da hora"#"Do not allow last-minute bookings"#g
s#"Este contato não está em nenhum pipeline"#"This contact is not in any pipeline"#g
s#"Erro ao carregar estatísticas de eventos"#"Failed to load event statistics"#g
s#"Erro ao processar autorização do Google"#"Failed to process Google authorization"#g
s#"Processando autorização do Microsoft\.\.\."#"Processing Microsoft authorization..."#g
s#"Permite agendamento em qualquer horário"#"Allows booking at any time"#g
s#"Google Sheets desconectado com sucesso!"#"Google Sheets disconnected successfully!"#g
s#"Agente pode consultar dados da planilha"#"Agent can read spreadsheet data"#g
s#"Selecione uma conversa ou crie uma nova"#"Select a conversation or create a new one"#g
s#"Atributos personalizados para conversas"#"Custom attributes for conversations"#g
s#"Erro ao atualizar duração das mensagens"#"Failed to update message duration"#g
s#"OAuth da Microsoft não está configurado"#"Microsoft OAuth is not configured"#g
s#"Erro ao carregar permissões do usuário"#"Failed to load user permissions"#g
s#"Erro ao carregar permissões do account"#"Failed to load account permissions"#g
s#"Verificando integrações disponíveis\.\.\."#"Checking available integrations..."#g
s#"Erro ao criar sessão: ID não retornado"#"Failed to create session: ID not returned"#g
s#"Atributos personalizados para contatos"#"Custom attributes for contacts"#g
s#"Nome do perfil atualizado com sucesso!"#"Profile name updated successfully!"#g
s#"Erro desconhecido ao conectar Outlook"#"Unknown error connecting Outlook"#g
s#"ID da API key deve ser um UUID válido"#"API key ID must be a valid UUID"#g
s#"Olá! Gostaria de falar com o suporte\."#"Hi! I\\'d like to talk to support."#g
s#"Mensagem enviada ao rejeitar chamadas"#"Message sent when rejecting calls"#g
s#"Erro ao atualizar descrição do perfil"#"Failed to update profile description"#g
s#"Conexão em tempo real reestabelecida"#"Real-time connection restored"#g
s#"Processando autorização do Google\.\.\."#"Processing Google authorization..."#g
s#"Erro ao conectar com Google Calendar"#"Failed to connect to Google Calendar"#g
s#"Como os agendamentos serão divididos"#"How bookings will be split"#g
s#"Configuração de descrição atualizada"#"Description setting updated"#g
s#"OAuth do Google não está configurado"#"Google OAuth is not configured"#g
s#"Adiciona uma nota privada à conversa"#"Adds a private note to the conversation"#g
s#"Erro ao alterar status da integração"#"Failed to change integration status"#g
s#"Erro desconhecido ao conectar Gmail"#"Unknown error connecting Gmail"#g
s#"Ex: Especialista em suporte técnico"#"Ex: Technical support specialist"#g
s#"Atlassian desconectado com sucesso!"#"Atlassian disconnected successfully!"#g
s#"Erro ao desconectar Google Calendar"#"Failed to disconnect Google Calendar"#g
s#"Como funciona o formulário pré-chat"#"How the pre-chat form works"#g
s#"Duração deve ser maior ou igual a 0"#"Duration must be greater than or equal to 0"#g
s#"Instância desconectada com sucesso!"#"Instance disconnected successfully!"#g
s#"Messaging Service SID é obrigatório"#"Messaging Service SID is required"#g
s#"Erro desconhecido ao salvar agente"#"Unknown error saving agent"#g
s#"Supabase desconectado com sucesso!"#"Supabase disconnected successfully!"#g
s#"Limite tempo para cada agendamento"#"Time limit for each booking"#g
s#"Erro ao conectar com Google Sheets"#"Failed to connect to Google Sheets"#g
s#"Permissão para adicionar em grupos"#"Permission to be added to groups"#g
s#"Falha na verificação do Notificame"#"Notificame verification failed"#g
s#"Envia um arquivo anexo na conversa"#"Sends an attached file in the conversation"#g
s#"Usando cache antigo de permissões"#"Using stale permissions cache"#g
s#"Mostrando {shown} de {total} dias"#"Showing {shown} of {total} days"#g
s#"Integração com agentes do Flowise"#"Integration with Flowise agents"#g
s#"Máximo de caracteres por segmento"#"Maximum characters per segment"#g
s#"Configurações salvas com sucesso!"#"Settings saved successfully!"#g
s#"HubSpot desconectado com sucesso!"#"HubSpot disconnected successfully!"#g
s#"Por favor, selecione uma planilha"#"Please select a spreadsheet"#g
s#"Erro ao desconectar Google Sheets"#"Failed to disconnect Google Sheets"#g
s#"Erro ao carregar eventos recentes"#"Failed to load recent events"#g
s#"Configuração de online atualizada"#"Online setting updated"#g
s#"Instância reiniciada com sucesso!"#"Instance restarted successfully!"#g
s#"Média diária das sessões por dia"#"Daily average of sessions per day"#g
s#"Adicionar regra de transferência"#"Add transfer rule"#g
s#"GitHub desconectado com sucesso!"#"GitHub disconnected successfully!"#g
s#"Stripe desconectado com sucesso!"#"Stripe disconnected successfully!"#g
s#"Linear desconectado com sucesso!"#"Linear disconnected successfully!"#g
s#"Monday desconectado com sucesso!"#"Monday disconnected successfully!"#g
s#"PayPal desconectado com sucesso!"#"PayPal disconnected successfully!"#g
s#"Atributos aplicados aos contatos"#"Attributes applied to contacts"#g
s#"Formulário pré-chat desabilitado"#"Pre-chat form disabled"#g
s#"Duração das mensagens atualizada"#"Message duration updated"#g
s#"Duração das mensagens (segundos)"#"Message duration (seconds)"#g
s#"Instância conectada com sucesso!"#"Instance connected successfully!"#g
s#"Mensagem de rejeição atualizada!"#"Rejection message updated!"#g
s#"Integração com workflows do N8N"#"Integration with N8N workflows"#g
s#"Asana desconectado com sucesso!"#"Asana disconnected successfully!"#g
s#"Canva desconectado com sucesso!"#"Canva disconnected successfully!"#g
s#"Por favor, selecione uma agenda"#"Please select a calendar"#g
s#"Limite máximo de dias permitido"#"Maximum days limit allowed"#g
s#"QR Code atualizado com sucesso!"#"QR Code updated successfully!"#g
s#"Provedor de email não suportado"#"Email provider not supported"#g
s#"Marca a conversa como resolvida"#"Marks the conversation as resolved"#g
s#"Altera a prioridade da conversa"#"Changes the conversation priority"#g
s#"Outlook conectado com sucesso!"#"Outlook connected successfully!"#g
s#"Integração com bots do Typebot"#"Integration with Typebot bots"#g
s#"Habilitar segmentação de texto"#"Enable text segmentation"#g
s#"Erro ao conectar com Atlassian"#"Failed to connect to Atlassian"#g
s#"Nenhum campo ativo para exibir"#"No active fields to display"#g
s#"Visualização da foto do perfil"#"Profile photo visibility"#g
s#"Erro ao atualizar configuração"#"Failed to update setting"#g
s#"Conexão verificada com sucesso"#"Connection verified successfully"#g
s#"Selecione um provedor de email"#"Select an email provider"#g
s#"Falha na verificação do Twilio"#"Twilio verification failed"#g
s#"Erro ao recarregar permissões"#"Failed to reload permissions"#g
s#"Conexão em tempo real perdida"#"Real-time connection lost"#g
s#"Você pode fechar esta janela\."#"You can close this window."#g
s#"Nenhuma ferramenta disponível"#"No tools available"#g
s#"Erro ao desconectar Atlassian"#"Failed to disconnect Atlassian"#g
s#"Erro ao conectar com Supabase"#"Failed to connect to Supabase"#g
s#"Erro ao desconectar instância"#"Failed to disconnect instance"#g
s#"Adiciona etiquetas à conversa"#"Adds labels to the conversation"#g
s#"Erro ao processar ação de IA"#"Failed to process AI action"#g
s#"Gmail conectado com sucesso!"#"Gmail connected successfully!"#g
s#"Tempo de 1ª resposta por dia"#"First response time per day"#g
s#"Permitir registrar lembretes"#"Allow recording reminders"#g
s#"Permitir manipular pipelines"#"Allow handling pipelines"#g
s#"Erro ao salvar configurações"#"Failed to save settings"#g
s#"Erro ao conectar com HubSpot"#"Failed to connect to HubSpot"#g
s#"Erro ao desconectar Supabase"#"Failed to disconnect Supabase"#g
s#"Tempo mínimo de antecedência"#"Minimum advance notice"#g
s#"Buscar ou digitar serviço\.\.\."#"Search or type a service..."#g
s#"Configurações de Privacidade"#"Privacy Settings"#g
s#"Remove etiquetas da conversa"#"Removes labels from the conversation"#g
s#"Remover atribuição de equipe"#"Remove team assignment"#g
s#"Enviar transcrição por email"#"Send transcript by email"#g
s#"Erro ao carregar integrações"#"Failed to load integrations"#g
s#"Erro ao atualizar integração"#"Failed to update integration"#g
s#"Verificando autenticação\.\.\."#"Verifying authentication..."#g
s#"Erro ao carregar permissões"#"Failed to load permissions"#g
s#"Resposta da IA sem conteúdo"#"AI response had no content"#g
s#"Falha ao carregar dashboard"#"Failed to load dashboard"#g
s#"Permitir edição de contatos"#"Allow contact editing"#g
s#"Erro ao conectar com GitHub"#"Failed to connect to GitHub"#g
s#"Erro ao conectar com Notion"#"Failed to connect to Notion"#g
s#"Erro ao conectar com Stripe"#"Failed to connect to Stripe"#g
s#"Erro ao conectar com Linear"#"Failed to connect to Linear"#g
s#"Erro ao conectar com Monday"#"Failed to connect to Monday"#g
s#"Erro ao desconectar HubSpot"#"Failed to disconnect HubSpot"#g
s#"Erro ao conectar com PayPal"#"Failed to connect to PayPal"#g
s#"Sessão deletada com sucesso"#"Session deleted successfully"#g
s#"Exemplo de mensagem enviada"#"Example of a sent message"#g
s#"Erro ao reiniciar instância"#"Failed to restart instance"#g
s#"Conexão testada com sucesso"#"Connection tested successfully"#g
s#"Tipo de canal não suportado"#"Channel type not supported"#g
s#"Altera o status da conversa"#"Changes the conversation status"#g
s#"Processando autorização\.\.\."#"Processing authorization..."#g
s#"O que o agente deve falar?"#"What should the agent say?"#g
s#"Erro ao desconectar GitHub"#"Failed to disconnect GitHub"#g
s#"Erro ao desconectar Stripe"#"Failed to disconnect Stripe"#g
s#"Erro ao desconectar Linear"#"Failed to disconnect Linear"#g
s#"Erro ao desconectar Monday"#"Failed to disconnect Monday"#g
s#"Erro ao conectar com Asana"#"Failed to connect to Asana"#g
s#"Erro ao desconectar PayPal"#"Failed to disconnect PayPal"#g
s#"Erro ao conectar com Canva"#"Failed to connect to Canva"#g
s#"Quando responder em áudio:"#"When to reply with audio:"#g
s#"Distância máxima permitida"#"Maximum distance allowed"#g
s#"Integração com Google Meet"#"Google Meet integration"#g
s#"Erro ao carregar planilhas"#"Failed to load spreadsheets"#g
s#"Verificando integrações\.\.\."#"Checking integrations..."#g
s#"Erro ao atualizar mensagem"#"Failed to update message"#g
s#"Instance ID não encontrado"#"Instance ID not found"#g
s#"Client Token é obrigatório"#"Client Token is required"#g
s#"Provedor SMS não suportado"#"SMS provider not supported"#g
s#"Conversas sem responsável"#"Unassigned conversations"#g
s#"Expandir período completo"#"Expand full period"#g
s#"Mapa de calor da operação"#"Operation heatmap"#g
s#"+ Adicionar ação anterior"#"+ Add previous action"#g
s#"Comportamento na Conversa"#"Conversation Behavior"#g
s#"Erro ao desconectar Asana"#"Failed to disconnect Asana"#g
s#"Erro ao desconectar Canva"#"Failed to disconnect Canva"#g
s#"Responder sempre em áudio"#"Always reply with audio"#g
s#"Solicitar nome da empresa"#"Ask for company name"#g
s#"Erro ao carregar usuários"#"Failed to load users"#g
s#"Nenhum serviço encontrado"#"No services found"#g
s#"Erro ao atualizar QR code"#"Failed to update QR code"#g
s#"Configurações de Chamadas"#"Call Settings"#g
s#"Website URL é obrigatório"#"Website URL is required"#g
s#"Account SID é obrigatório"#"Account SID is required"#g
s#"Admin Token é obrigatório"#"Admin Token is required"#g
s#"Instance ID é obrigatório"#"Instance ID is required"#g
s#"Falha no teste de conexão"#"Connection test failed"#g
s#"Selecione um provedor SMS"#"Select an SMS provider"#g
s#"Solicitar nome do usuário"#"Ask for the user\\'s name"#g
s#"Erro ao conectar Outlook"#"Failed to connect Outlook"#g
s#"Status da operação agora"#"Operation status right now"#g
s#"1ª resposta média humana"#"Average human first response"#g
s#"Diagnóstico e otimização"#"Diagnostics and optimization"#g
s#"Criar\/gerenciar serviços"#"Create/manage services"#g
s#"Permitir editar contatos"#"Allow editing contacts"#g
s#"Agentes como Ferramentas"#"Agents as Tools"#g
s#"Erro ao carregar agendas"#"Failed to load calendars"#g
s#"Duração máxima da agenda"#"Maximum calendar duration"#g
s#"Distribuição Inteligente"#"Smart Distribution"#g
s#"Erro ao carregar sessões"#"Failed to load sessions"#g
s#"Template de email visual"#"Visual email template"#g
s#"Auth Token é obrigatório"#"Auth Token is required"#g
s#"Channel ID é obrigatório"#"Channel ID is required"#g
s#"URL da API é obrigatória"#"API URL is required"#g
s#"Erro no teste de conexão"#"Connection test error"#g
s#"Canal criado com sucesso"#"Channel created successfully"#g
s#"Erro ao atualizar conta"#"Failed to update account"#g
s#"Mostrar últimos 15 dias"#"Show last 15 days"#g
s#"Carregando dashboard\.\.\."#"Loading dashboard..."#g
s#"Lista de Servidores MCP"#"MCP Servers List"#g
s#"Criar\/gerenciar tarefas"#"Create/manage tasks"#g
s#"Ferramentas Disponíveis"#"Available Tools"#g
s#"Horários de atendimento"#"Service hours"#g
s#"Campos para agendamento"#"Booking fields"#g
s#"Carregando planilhas\.\.\."#"Loading spreadsheets..."#g
s#"Erro ao enviar mensagem"#"Failed to send message"#g
s#"Mensagem de Boas-vindas"#"Welcome Message"#g
s#"Configuração dos Campos"#"Field Configuration"#g
s#"Confirmações de leitura"#"Read receipts"#g
s#"Configurações de Perfil"#"Profile Settings"#g
s#"API Token é obrigatório"#"API Token is required"#g
s#"Erro ao conectar Gmail"#"Failed to connect Gmail"#g
s#"Conversas ativas agora"#"Active conversations now"#g
s#"Participação por canal"#"Share by channel"#g
s#"Valor total por canais"#"Total value by channel"#g
s#"Canais com maior valor"#"Highest-value channels"#g
s#"Configuração de Tarefa"#"Task Configuration"#g
s#"Assinatura da Mensagem"#"Message Signature"#g
s#"Erro ao carregar vozes"#"Failed to load voices"#g
s#"Selecione uma planilha"#"Select a spreadsheet"#g
s#"Erro ao deletar sessão"#"Failed to delete session"#g
s#"Digite sua mensagem\.\.\."#"Type your message..."#g
s#"Carregando conversa\.\.\."#"Loading conversation..."#g
s#"Visualização do recado"#"Status visibility"#g
s#"Visualização de online"#"Online visibility"#g
s#"QR Code não encontrado"#"QR Code not found"#g
s#"Erro ao exibir QR code"#"Failed to display QR code"#g
s#"Telefone é obrigatório"#"Phone is required"#g
s#"Adicionar nota privada"#"Add private note"#g
s#"Distribuição de notas"#"Rating distribution"#g
s#"Lista de Custom Tools"#"Custom Tools List"#g
s#"Interagir com cliente"#"Interact with customer"#g
s#"Regras de atribuição:"#"Assignment rules:"#g
s#"APLICAR CONFIGURAÇÕES"#"APPLY SETTINGS"#g
s#"Configurar integração"#"Configure integration"#g
s#"Carregando agendas\.\.\."#"Loading calendars..."#g
s#"Sessão não encontrada"#"Session not found"#g
s#"Selecione um Template"#"Select a Template"#g
s#"Preview do Formulário"#"Form Preview"#g
s#"Erro ao obter QR code"#"Failed to get QR code"#g
s#"API URL é obrigatório"#"API URL is required"#g
s#"Selecione um provedor"#"Select a provider"#g
s#"Status de Confirmação"#"Confirmation Status"#g
s#"Começar Edição Visual"#"Start Visual Editing"#g
s#"Erro ao buscar conta"#"Failed to fetch account"#g
s#"1ª resposta média IA"#"Average AI first response"#g
s#"Modo de Visualização"#"View Mode"#g
s#"Informações pessoais"#"Personal information"#g
s#"Estado de Publicação"#"Publication State"#g
s#"Selecione o pipeline"#"Select the pipeline"#g
s#"Selecione o usuário:"#"Select the user:"#g
s#"Selecione um usuário"#"Select a user"#g
s#"Ações de inatividade"#"Inactivity actions"#g
s#"SALVAR CONFIGURAÇÕES"#"SAVE SETTINGS"#g
s#"Adicionar Custom MCP"#"Add Custom MCP"#g
s#"Desativar integração"#"Deactivate integration"#g
s#"Selecione uma agenda"#"Select a calendar"#g
s#"Consulta de horários"#"Availability lookup"#g
s#"Modo de distribuição"#"Distribution mode"#g
s#"Erro ao criar sessão"#"Failed to create session"#g
s#"Usuário Desconhecido"#"Unknown User"#g
s#"Catálogo de serviços"#"Service catalog"#g
s#"Salvar Configurações"#"Save Settings"#g
s#"QR Code para Conexão"#"QR Code for Connection"#g
s#"Mensagem de Rejeição"#"Rejection Message"#g
s#"Falha ao criar canal"#"Failed to create channel"#g
s#"Participação humana"#"Human share"#g
s#"campos selecionados"#"fields selected"#g
s#"Se não responder em"#"If no reply within"#g
s#"Selecione o estágio"#"Select the stage"#g
s#"Carregando vozes\.\.\."#"Loading voices..."#g
s#"Buscar conversas\.\.\."#"Search conversations..."#g
s#"Formulário Pré-Chat"#"Pre-Chat Form"#g
s#"Campos Obrigatórios"#"Required Fields"#g
s#"Não aceito chamadas"#"I do not accept calls"#g
s#"Descrição do Perfil"#"Profile Description"#g
s#"Descrição do perfil"#"Profile description"#g
s#"Token é obrigatório"#"Token is required"#g
s#"Todos os pipelines"#"All pipelines"#g
s#"Insights de canais"#"Channel insights"#g
s#"Concentração Top 3"#"Top 3 concentration"#g
s#"Nova Ação Agendada"#"New Scheduled Action"#g
s#"Edição de Contatos"#"Contact Editing"#g
s#"Integração Externa"#"External Integration"#g
s#"Adicionar pipeline"#"Add pipeline"#g
s#"Ações da Instância"#"Instance Actions"#g
s#"Silenciar conversa"#"Mute conversation"#g
s#"Adicionar etiqueta"#"Add label"#g
s#"Alterar prioridade"#"Change priority"#g
s#"Todos os usuários"#"All users"#g
s#"Conversas por dia"#"Conversations per day"#g
s#"Agente Sequencial"#"Sequential Agent"#g
s#"Erro desconhecido"#"Unknown error"#g
s#"Criando agente\.\.\."#"Creating agent..."#g
s#"Campos Adicionais"#"Additional Fields"#g
s#"Adicionar estágio"#"Add stage"#g
s#"Selecione o time:"#"Select the team:"#g
s#"Selecione um time"#"Select a team"#g
s#"ATIVAR INTEGRAÇÃO"#"ACTIVATE INTEGRATION"#g
s#"Selecione uma voz"#"Select a voice"#g
s#"Template de email"#"Email template"#g
s#"Lista de bloqueio"#"Block list"#g
s#"Atualizar QR Code"#"Refresh QR Code"#g
s#"Salvar Assinatura"#"Save Signature"#g
s#"Resolver conversa"#"Resolve conversation"#g
s#"Visualização HTML"#"HTML View"#g
s#"Todas as equipes"#"All teams"#g
s#"Campos editáveis"#"Editable fields"#g
s#"Selecionar todos"#"Select all"#g
s#"Formato de Saída"#"Output Format"#g
s#"Selecionar todas"#"Select all"#g
s#"Permitir Leitura"#"Allow Read"#g
s#"Permitir Escrita"#"Allow Write"#g
s#"Permitir Criação"#"Allow Create"#g
s#"Teste seu agente"#"Test your agent"#g
s#"Nenhuma conversa"#"No conversations"#g
s#"Visto por último"#"Last seen"#g
s#"0 = desabilitado"#"0 = disabled"#g
s#"Remover etiqueta"#"Remove label"#g
s#"Todos os canais"#"All channels"#g
s#"Aplicar filtros"#"Apply filters"#g
s#"Participação IA"#"AI share"#g
s#"Ações Agendadas"#"Scheduled Actions"#g
s#"Agente Paralelo"#"Parallel Agent"#g
s#"Nome da Empresa"#"Company Name"#g
s#"Desmarcar todos"#"Deselect all"#g
s#"Sessão removida"#"Session removed"#g
s#"Data de Criação"#"Created At"#g
s#"Trocar Template"#"Change Template"#g
s#"Total de Campos"#"Total Fields"#g
s#"Ocultar Preview"#"Hide Preview"#g
s#"Atribuir equipe"#"Assign team"#g
s#"Enviar mensagem"#"Send message"#g
s#"Atribuir agente"#"Assign agent"#g
s#"Limpar filtros"#"Clear filters"#g
s#"Dia mais forte"#"Busiest day"#g
s#"Lista de Ações"#"Actions List"#g
s#"Campos Básicos"#"Basic Fields"#g
s#"Conectado como"#"Connected as"#g
s#"NÃO DISPONÍVEL"#"NOT AVAILABLE"#g
s#"Nome do Perfil"#"Profile Name"#g
s#"Nome do perfil"#"Profile name"#g
s#"Adiar conversa"#"Snooze conversation"#g
s#"Alterar status"#"Change status"#g
s#"Enviar webhook"#"Send webhook"#g
s#"Canais ativos"#"Active channels"#g
s#"o agente deve"#"the agent should"#g
s#"Configurações"#"Settings"#g
s#"Sempre aberto"#"Always open"#g
s#"Nova Conversa"#"New Conversation"#g
s#"Campos Ativos"#"Active Fields"#g
s#"Pico semanal"#"Weekly peak"#g
s#"Hora de pico"#"Peak hour"#g
s#"Participação"#"Share"#g
s#"Buscar Ações"#"Search Actions"#g
s#"Configuração"#"Configuration"#g
s#"Teste sua IA"#"Test your AI"#g
s#"Valor Total:"#"Total Value:"#g
s#"Desconhecido"#"Unknown"#g
s#"Enviar anexo"#"Send attachment"#g
s#"Atraso alto"#"High delay"#g
s#"Dados reais"#"Real data"#g
s#"Canal líder"#"Top channel"#g
s#"Agente Loop"#"Loop Agent"#g
s#"Localização"#"Location"#g
s#"Instruções:"#"Instructions:"#g
s#"Integrações"#"Integrations"#g
s#"Método HTTP"#"HTTP Method"#g
s#"Ver Preview"#"Show Preview"#g
s#"Canal Email"#"Email Channel"#g
s#"CSAT médio"#"Average CSAT"#g
s#"avaliações"#"ratings"#g
s#"Abrir tour"#"Open tour"#g
s#"Agente LLM"#"LLM Agent"#g
s#"Instruções"#"Instructions"#g
s#"Permissões"#"Permissions"#g
s#"em atraso"#"overdue"#g
s#"conversas"#"conversations"#g
s#"Indústria"#"Industry"#g
s#"Descrição"#"Description"#g
s#"Template:"#"Template:"#g
s#"Conversas"#"Conversations"#g
s#"Resolvido"#"Resolved"#g
s#"Atualizar"#"Update"#g
s#"Resolvida"#"Resolved"#g
s#"Sucesso!"#"Success!"#g
s#"Concluir"#"Finish"#g
s#"Horários"#"Schedule"#g
s#"conversa"#"conversation"#g
s#"← Voltar"#"← Back"#g
s#"Contatos"#"Contacts"#g
s#"Pendente"#"Pending"#g
s#"Usuário"#"User"#g
s#"Filtros"#"Filters"#g
s#"Atenção"#"Attention"#g
s#"Crítico"#"Critical"#g
s#"Estável"#"Stable"#g
s#"Período"#"Period"#g
s#"Próximo"#"Next"#g
s#"Duração"#"Duration"#g
s#"Estágio"#"Stage"#g
s#"Empresa"#"Company"#g
s#"Ninguém"#"Nobody"#g
s#"Urgente"#"Urgent"#g
s#"Semanas"#"Weeks"#g
s#"Equipe"#"Team"#g
s#"Em dia"#"On track"#g
s#"Voltar"#"Back"#g
s#"Fechar"#"Close"#g
s#"ATIVAR"#"ACTIVATE"#g
s#"Salvar"#"Save"#g
s#"Sessão"#"Session"#g
s#"Padrão"#"Default"#g
s#"Aberto"#"Open"#g
s#"Função"#"Role"#g
s#"Aberta"#"Open"#g
s#"Pular"#"Skip"#g
s#"Saída"#"Outgoing"#g
s#"Todos"#"All"#g
s#"Baixa"#"Low"#g
s#"Média"#"Medium"#g
s#"Abrir"#"Open"#g
s#"Horas"#"Hours"#g
s#"Meses"#"Months"#g
s#"País"#"Country"#g
s#"Nome"#"Name"#g
s#"Alta"#"High"#g
s#"Dias"#"Days"#g
s#"Erro"#"Error"#g
s#"Até"#"Until"#g
s#" dias)"#" days)"#g
s#" dias"#" days"#g
s#" mais"#" more"#g
s# desconectado com sucesso# disconnected successfully#g
s# conectado com sucesso# connected successfully#g
s#Erro ao atualizar #Failed to update #g
s# não permitido# not allowed#g
s#Erro de autorização: #Authorization error: #g
s#Erro ao processar arquivo #Failed to process file #g
s#' não implementado#\\' not implemented#g
s# é muito grande (máximo 10MB)# is too large (max 10MB)#g
s#Tipo de arquivo #File type #g
s# excede o tamanho máximo de # exceeds the maximum size of #g
s#\[Permissions\] Permissão negada: #[Permissions] Permission denied: #g
# Website chat widget: the stock build has no strings for the pre-chat form (shows raw keys). Adds them to channels.preChatForm.
s#"preChatForm":{"success":{"updated":"Pre-chat form settings updated successfully!"}#"preChatForm":{"message":"How can we help?","messagePlaceholder":"Tell us what you need","starting":"Starting...","startConversation":"Start Conversation","provideDetails":"Share your details to start the chat.","selectOption":"Select an option","validation":{"invalidEmail":"Enter a valid email address","invalidPhone":"Enter your number with country code, like +2348012345678","invalidUrl":"Enter a valid link","invalidNumber":"Enter a number","invalidDate":"Enter a valid date","invalidFormat":"Check this value","required":"This field is required","messageRequired":"Please write a message"},"success":{"updated":"Pre-chat form settings updated successfully!"}#g
# Website chat widget, labels: the widget reads channels.preChatForm.*, a sibling of channels.settings. The rule above only filled channels.settings.preChatForm, so the widget still showed raw keys.
s#settings:\([A-Za-z0-9_$]*\),deleteDialog:\([A-Za-z0-9_$]*\)}#settings:\1,deleteDialog:\2,preChatForm:{"message":"How can we help?","messagePlaceholder":"Tell us what you need","starting":"Starting...","startConversation":"Start Conversation","provideDetails":"Share your details to start the chat.","selectOption":"Select an option","validation":{"invalidEmail":"Enter a valid email address","invalidPhone":"Enter your number with country code, like +2348012345678","invalidUrl":"Enter a valid link","invalidNumber":"Enter a number","invalidDate":"Enter a valid date","invalidFormat":"Check this value","required":"This field is required","messageRequired":"Please write a message"}}}#g
# Website chat widget, Start button: the CRM answers POST /widget/conversations with a 500 whenever the body has a custom_attributes key (even the name and email the widget puts there), so "Start chat" did nothing. Contact details already travel in the contact object, so send no custom_attributes. The second rule handles a container that already ran the first version of this fix.
s#referer_url:document\.referrer||""},custom_attributes:i||{}}#referer_url:document.referrer||""}}#g
s#referer_url:document\.referrer||""},\.\.\.(i&&Object\.keys(i)\.length?{custom_attributes:i}:{})}#referer_url:document.referrer||""}}#g
# Website chat widget, phone: the CRM refuses a contact phone that is not international (422, in Portuguese) and the widget swallows the error, so a visitor who types 0806... sees nothing happen. Turn Nigerian local and 234... numbers into +234..., and send no phone at all when it still is not valid, so the chat always starts (the field is optional).
s#phone_number:a\.phoneNumber||""}#phone_number:((p)=>{p=String(p||"").replace(/[ ()-]/g,"");if(/^0[0-9]{10}$/.test(p))p="+234"+p.slice(1);else if(/^234[0-9]{10}$/.test(p))p="+"+p;return/^[+][1-9][0-9]{7,14}$/.test(p)?p:""})(a.phoneNumber)}#g
# Website chat widget, Start button: white text so it reads on the brand colour.
s#style:{backgroundColor:r},children:o?#style:{backgroundColor:r,color:"\#fff"},children:o?#g
# Website chat widget, Start button label: change an already-patched file too (the first rules insert the strings only once, a container keeps its patched files across restarts).
s#"startConversation":"Start chat"#"startConversation":"Start Conversation"#g
